#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { google } from 'googleapis';

// .env.local を最初に読み込む
config({ path: resolve(process.cwd(), '.env.local') });

// ────────────────────────────────────────────────────────────
// Cloudflare Pages 本番URL（QRコードのリンク先として使用）
// 環境変数 APP_BASE_URL または CLOUDFLARE_PROD_ORIGIN で上書き可能
// ────────────────────────────────────────────────────────────
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.CLOUDFLARE_PROD_ORIGIN || 'https://sugukuru-2.pages.dev';

// ────────────────────────────────────────────────────────────
// QR Safe Box 配置定数（pt単位）
// ────────────────────────────────────────────────────────────
const PAGE_WIDTH_PT = 595.5;
const SAFE_BOX_TOP_Y_PT = 500;
const SAFE_BOX_BOTTOM_Y_PT = 170;
const SAFE_BOX_SIDE_MARGIN_PT = 80;

const PDF_TITLE = 'SUGUKURU スターターキット';
const ATTACHMENT_FILENAME = 'SUGUKURU スターターキット.pdf';

// ────────────────────────────────────────────────────────────
// コマンドライン引数パース（拡張版）
// ────────────────────────────────────────────────────────────
interface ParsedArgs {
  // 従来オプション
  name?: string;
  email?: string;
  storeId?: string;
  qrSizeOverride?: number;
  qrXOverride?: number;
  qrYOverride?: number;
  // 新規オプション
  requestId?: string;
  publish?: boolean;
  sendEmail?: boolean;
  dryRun?: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--name':
        parsed.name = next;
        i++;
        break;
      case '--email':
        parsed.email = next;
        i++;
        break;
      case '--storeId':
      case '--store-id':
        parsed.storeId = next;
        i++;
        break;
      case '--qrSize':
        parsed.qrSizeOverride = Number(next);
        i++;
        break;
      case '--qrX':
        parsed.qrXOverride = Number(next);
        i++;
        break;
      case '--qrY':
        parsed.qrYOverride = Number(next);
        i++;
        break;
      case '--request-id':
      case '--requestId':
        parsed.requestId = next;
        i++;
        break;
      case '--publish':
        parsed.publish = next === 'true' || next === '1';
        i++;
        break;
      case '--send-email':
      case '--sendEmail':
        parsed.sendEmail = next === 'true' || next === '1';
        i++;
        break;
      case '--dry-run':
      case '--dryRun':
        parsed.dryRun = true;
        break;
    }
  }

  return parsed;
}

function printUsage() {
  console.error('使用方法:');
  console.error('');
  console.error('【従来モード（後方互換）】');
  console.error('  npm run onboard:facility -- --name "施設名" --email "担当者メール" [--storeId "uuid"]');
  console.error('');
  console.error('【申請IDモード（新規）】');
  console.error('  npm run onboard:facility -- --request-id <uuid> [--publish true] [--send-email false] [--dry-run]');
  console.error('');
  console.error('オプション:');
  console.error('  --request-id <uuid>    onboarding_requests から取得');
  console.error('  --publish true/false   is_published を設定（デフォルト: false）');
  console.error('  --send-email true/false  Gmail下書き作成（デフォルト: false）');
  console.error('  --dry-run              実際のDB変更を行わない');
  console.error('');
  console.error('QR位置調整オプション（通常は自動計算）:');
  console.error('  --qrSize <pt>  QRコードサイズ');
  console.error('  --qrX <pt>     X座標');
  console.error('  --qrY <pt>     Y座標');
}

// ────────────────────────────────────────────────────────────
// Gmail関連（既存コード維持）
// ────────────────────────────────────────────────────────────
function createGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'http://localhost'
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createMimeMessage(
  to: string,
  from: string,
  subject: string,
  htmlBody: string,
  pdfBuffer: Buffer,
  qrBuffer: Buffer,
): string {
  const boundary = '----=_Part_' + Date.now();
  const attachmentBoundary = '----=_Attachment_' + Date.now();

  const encodedPdfFilename = `=?UTF-8?B?${Buffer.from(ATTACHMENT_FILENAME).toString('base64')}?=`;
  const encodedQrFilename = `=?UTF-8?B?${Buffer.from('SUGUKURU QRコード.png').toString('base64')}?=`;

  const messageParts = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: multipart/related; boundary="${attachmentBoundary}"`,
    '',
    `--${attachmentBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    '',
    `--${attachmentBoundary}--`,
    '',
    `--${boundary}`,
    'Content-Type: application/pdf',
    `Content-Disposition: attachment; filename="${encodedPdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    pdfBuffer.toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: image/png',
    `Content-Disposition: attachment; filename="${encodedQrFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    qrBuffer.toString('base64'),
    '',
    `--${boundary}--`,
  ];

  return messageParts.join('\r\n');
}

// ────────────────────────────────────────────────────────────
// 営業時間を facility_open_intervals に挿入
// ────────────────────────────────────────────────────────────
interface OpenInterval {
  dow: number;
  start: string;
  end: string;
}

async function insertOpenIntervals(
  supabase: SupabaseClient,
  facilityId: string,
  intervals: OpenInterval[],
  timezone: string = 'Asia/Tokyo'
): Promise<void> {
  if (intervals.length === 0) return;

  // 既存の営業時間を削除
  await supabase
    .from('facility_open_intervals')
    .delete()
    .eq('facility_id', facilityId);

  // 新しい営業時間を挿入
  const rows = intervals.map(interval => ({
    facility_id: facilityId,
    day_of_week: interval.dow,
    start_time: interval.start + ':00',
    end_time: interval.end + ':00',
    timezone,
  }));

  const { error } = await supabase
    .from('facility_open_intervals')
    .insert(rows);

  if (error) {
    console.error('⚠️ 営業時間の登録に失敗しました:', error);
  } else {
    console.log(`✅ 営業時間を ${rows.length} 件登録しました`);
  }
}

// ────────────────────────────────────────────────────────────
// 写真を facility_photos に挿入
// ────────────────────────────────────────────────────────────
async function insertPhotos(
  supabase: SupabaseClient,
  facilityId: string,
  photoUrls: string[]
): Promise<void> {
  if (photoUrls.length === 0) return;

  // 既存の写真を削除
  await supabase
    .from('facility_photos')
    .delete()
    .eq('facility_id', facilityId);

  // 新しい写真を挿入
  const rows = photoUrls.map((url, index) => ({
    facility_id: facilityId,
    url,
    alt: `写真 ${index + 1}`,
    sort_order: index,
  }));

  const { error } = await supabase
    .from('facility_photos')
    .insert(rows);

  if (error) {
    console.error('⚠️ 写真の登録に失敗しました:', error);
  } else {
    console.log(`✅ 写真を ${rows.length} 件登録しました`);
  }
}

// ────────────────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 施設オンボード処理を開始します...\n');

  const args = parseArgs();
  const { requestId, publish = false, sendEmail = false, dryRun = false } = args;
  let { name, email } = args;
  const { storeId, qrSizeOverride, qrXOverride, qrYOverride } = args;

  // 引数チェック
  if (!requestId && (!name || !email)) {
    printUsage();
    process.exit(1);
  }

  // 環境変数チェック
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_BASE_URL'];
  if (sendEmail) {
    requiredEnvVars.push('GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM');
  }
  const missing = requiredEnvVars.filter(key => !process.env[key] && key !== 'APP_BASE_URL');
  if (missing.length > 0) {
    console.error('❌ 環境変数が不足しています:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }

  if (dryRun) {
    console.log('🔍 ドライランモード: 実際のDB変更は行いません\n');
  }

  // Supabase接続
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 追加データ用変数
  let minPriceYen: number | null = null;
  let maxPriceYen: number | null = null;
  let openIntervals: OpenInterval[] = [];
  let photoUrls: string[] = [];
  let category: string | null = null;
  const timezone = 'Asia/Tokyo';

  // ────────────────────────────────────────────────────────────
  // A) request-id 指定時は onboarding_requests から取得
  // ────────────────────────────────────────────────────────────
  if (requestId) {
    console.log(`📥 申請ID ${requestId} から情報を取得中...`);
    
    const { data: request, error } = await supabase
      .from('onboarding_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error || !request) {
      console.error('❌ 申請が見つかりません:', error);
      process.exit(1);
    }

    name = request.facility_name;
    email = request.contact_email;
    minPriceYen = request.min_price_yen;
    maxPriceYen = request.max_price_yen;
    category = request.category;
    
    if (request.open_intervals && Array.isArray(request.open_intervals)) {
      openIntervals = request.open_intervals as OpenInterval[];
    }
    
    if (request.photo_urls && Array.isArray(request.photo_urls)) {
      photoUrls = request.photo_urls as string[];
    }

    console.log(`✅ 申請情報を取得しました`);
    console.log(`   施設名: ${name}`);
    console.log(`   メール: ${email}`);
    console.log(`   営業時間枠: ${openIntervals.length} 件`);
    console.log(`   写真: ${photoUrls.length} 件\n`);

    // バリデーション警告
    if (openIntervals.length === 0) {
      console.warn('⚠️ 警告: 営業時間（open_intervals）が空です。TOPページで「営業時間外」と表示される可能性があります。');
    }
    if (photoUrls.length === 0) {
      console.warn('⚠️ 警告: 写真（photo_urls）が空です。施設一覧でデフォルト画像が表示されます。');
    }
  }

  console.log(`📝 施設名: ${name}`);
  console.log(`📧 メール: ${email}`);
  console.log(`📢 公開: ${publish}`);
  console.log(`📧 メール送信: ${sendEmail}`);
  if (storeId) console.log(`🏪 店舗ID: ${storeId}`);
  console.log('');

  if (dryRun) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 ドライラン: 作成/更新予定内容');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`施設名: ${name}`);
    console.log(`担当者メール: ${email}`);
    console.log(`公開設定 (is_published): ${publish}`);
    console.log(`カテゴリ: ${category || '未設定'}`);
    console.log(`最低価格: ${minPriceYen ?? '未設定'} 円`);
    console.log(`最高価格: ${maxPriceYen ?? '未設定'} 円`);
    console.log(`タイムゾーン: ${timezone}`);
    console.log(`営業時間枠: ${openIntervals.length} 件`);
    if (openIntervals.length > 0) {
      openIntervals.forEach((i, idx) => {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        console.log(`  [${idx + 1}] ${days[i.dow]}曜 ${i.start}〜${i.end}`);
      });
    }
    console.log(`写真URL: ${photoUrls.length} 件`);
    photoUrls.forEach((url, idx) => console.log(`  [${idx}] ${url}`));
    console.log('');
    console.log('buy_url (生成予定):');
    console.log(`  ${APP_BASE_URL.replace(/\/$/, '')}/buy?facilityId=<新規ID>`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 ドライラン完了（DB変更なし）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return;
  }

  // ────────────────────────────────────────────────────────────
  // B) facilities を upsert
  // ────────────────────────────────────────────────────────────
  console.log('💾 施設をデータベースに登録中...');

  let facilityId: string;

  // 既存の施設を name で検索（重複防止）
  const { data: existingFacility } = await supabase
    .from('facilities')
    .select('id')
    .eq('name', name)
    .maybeSingle();

  if (existingFacility) {
    facilityId = existingFacility.id;
    console.log(`📝 既存施設を更新: ${facilityId}`);

    const { error: updateError } = await supabase
      .from('facilities')
      .update({
        contact_email: email,
        store_id: storeId || null,
        is_published: publish,
        min_price_yen: minPriceYen,
        max_price_yen: maxPriceYen,
        timezone,
        category,
      })
      .eq('id', facilityId);

    if (updateError) {
      console.error('❌ 施設の更新に失敗しました:', updateError);
      process.exit(1);
    }
  } else {
    const { data: facility, error: insertError } = await supabase
      .from('facilities')
      .insert({
        name,
        contact_email: email,
        store_id: storeId || null,
        is_published: publish,
        min_price_yen: minPriceYen,
        max_price_yen: maxPriceYen,
        timezone,
        category,
      })
      .select('id')
      .single();

    if (insertError || !facility) {
      console.error('❌ 施設の登録に失敗しました:', insertError);
      process.exit(1);
    }

    facilityId = facility.id;
  }

  console.log(`✅ 施設ID: ${facilityId}\n`);

  // ────────────────────────────────────────────────────────────
  // C) facility_open_intervals を生成
  // ────────────────────────────────────────────────────────────
  if (openIntervals.length > 0) {
    console.log('⏰ 営業時間を登録中...');
    await insertOpenIntervals(supabase, facilityId, openIntervals, timezone);
  }

  // ────────────────────────────────────────────────────────────
  // D) facility_photos を生成
  // ────────────────────────────────────────────────────────────
  if (photoUrls.length > 0) {
    console.log('📷 写真を登録中...');
    await insertPhotos(supabase, facilityId, photoUrls);
  }

  // ────────────────────────────────────────────────────────────
  // stores テーブルへの upsert（導入店舗一覧に表示されるため必須）
  // ────────────────────────────────────────────────────────────
  console.log('💾 stores テーブルに登録中（導入店舗一覧表示用）...');
  const { error: storeUpsertError } = await supabase
    .from('stores')
    .upsert({
      id: facilityId,
      name,
      description: null,
      current_wait_time: 30,
      fastpass_price: minPriceYen || 1000,
      peak_extra_price: 0,
      is_open: publish, // is_published と連動
      facility_id: facilityId, // facilities との紐付け
    }, { onConflict: 'id' });

  if (storeUpsertError) {
    console.error('⚠️ stores テーブルへの登録に失敗しました:', storeUpsertError);
  } else {
    console.log('✅ stores テーブルに登録しました\n');
  }

  // ────────────────────────────────────────────────────────────
  // E) buyUrl 生成
  // ────────────────────────────────────────────────────────────
  const qrBaseUrl = APP_BASE_URL.replace(/\/$/, '');
  const buyUrl = `${qrBaseUrl}/buy?facilityId=${facilityId}`;
  console.log(`🔗 購入URL（QRリンク先）: ${buyUrl}`);
  console.log(`📍 APP_BASE_URL: ${APP_BASE_URL}`);

  // ────────────────────────────────────────────────────────────
  // F) QR生成（PNG、透明背景）
  // ────────────────────────────────────────────────────────────
  console.log('📱 QRコードを生成中（透明背景）...');
  const qrBuffer = await QRCode.toBuffer(buyUrl, {
    type: 'png',
    width: 512,
    margin: 0,
    color: {
      dark: '#000000',
      light: '#0000',
    },
  });
  console.log('✅ QRコード生成完了\n');

  // Storage にQRアップロード
  console.log('☁️  QRコードをSupabase Storageにアップロード中...');
  const qrPath = `facilities/${facilityId}/qr.png`;
  const { error: qrUploadError } = await supabase.storage
    .from('facility-assets')
    .upload(qrPath, qrBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (qrUploadError) {
    console.error('❌ QRコードのアップロードに失敗しました:', qrUploadError);
    console.error('💡 Supabase Storageで "facility-assets" バケット（public）を作成してください。');
    process.exit(1);
  }

  const { data: qrPublicData } = supabase.storage
    .from('facility-assets')
    .getPublicUrl(qrPath);

  const qrUrl = qrPublicData.publicUrl;
  console.log(`✅ QR URL: ${qrUrl}\n`);

  // ────────────────────────────────────────────────────────────
  // G) PDF生成（テンプレにQR合成）
  // ────────────────────────────────────────────────────────────
  console.log('📄 スターターキットPDFを生成中...');
  const templatePath = resolve(process.cwd(), 'assets/starter-kit-template.pdf');

  if (!existsSync(templatePath)) {
    console.error('❌ テンプレートPDFが見つかりません。');
    console.error(`💡 以下のパスにPDFを配置してください: ${templatePath}`);
    process.exit(1);
  }

  const templateBytes = readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.setTitle(PDF_TITLE);

  const qrImage = await pdfDoc.embedPng(qrBuffer);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const pageWidth = firstPage.getWidth();
  const pageHeight = firstPage.getHeight();

  const safeBoxHeight = SAFE_BOX_TOP_Y_PT - SAFE_BOX_BOTTOM_Y_PT;
  const safeBoxWidth = pageWidth - (2 * SAFE_BOX_SIDE_MARGIN_PT);
  const qrSize = qrSizeOverride ?? Math.min(safeBoxWidth, safeBoxHeight);
  const qrX = qrXOverride ?? (SAFE_BOX_SIDE_MARGIN_PT + (safeBoxWidth - qrSize) / 2);
  const qrY = qrYOverride ?? (SAFE_BOX_BOTTOM_Y_PT + (safeBoxHeight - qrSize) / 2);

  console.log(`📐 QR Safe Box 配置計算:`);
  console.log(`   - ページサイズ: ${pageWidth.toFixed(1)} x ${pageHeight.toFixed(1)} pt`);
  console.log(`   - QRサイズ: ${qrSize.toFixed(1)} pt`);
  console.log(`   - QR配置: x=${qrX.toFixed(1)}, y=${qrY.toFixed(1)}`);

  firstPage.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  console.log(`✅ PDF生成完了\n`);

  // Storage にPDFアップロード
  console.log('☁️  PDFをSupabase Storageにアップロード中...');
  const pdfPath = `facilities/${facilityId}/starter-kit.pdf`;
  const { error: pdfUploadError } = await supabase.storage
    .from('facility-assets')
    .upload(pdfPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (pdfUploadError) {
    console.error('❌ PDFのアップロードに失敗しました:', pdfUploadError);
    process.exit(1);
  }

  const { data: pdfPublicData } = supabase.storage
    .from('facility-assets')
    .getPublicUrl(pdfPath);

  const pdfUrl = pdfPublicData.publicUrl;
  console.log(`✅ PDF URL: ${pdfUrl}\n`);

  // ────────────────────────────────────────────────────────────
  // H) facilities を update（URL情報を保存）
  // ────────────────────────────────────────────────────────────
  console.log('💾 施設情報を更新中...');
  const { error: updateError } = await supabase
    .from('facilities')
    .update({
      buy_url: buyUrl,
      qr_png_path: qrPath,
      starter_pdf_path: pdfPath,
    })
    .eq('id', facilityId);

  if (updateError) {
    console.error('❌ 施設情報の更新に失敗しました:', updateError);
    process.exit(1);
  }
  console.log('✅ 施設情報を更新しました\n');

  // ────────────────────────────────────────────────────────────
  // I) 申請ステータスを approved に更新
  // ────────────────────────────────────────────────────────────
  if (requestId) {
    console.log('📝 申請ステータスを更新中...');
    const { error: statusError } = await supabase
      .from('onboarding_requests')
      .update({ status: 'approved' })
      .eq('id', requestId);

    if (statusError) {
      console.error('⚠️ 申請ステータスの更新に失敗しました:', statusError);
    } else {
      console.log('✅ 申請ステータスを approved に更新しました\n');
    }
  }

  // ────────────────────────────────────────────────────────────
  // J) Gmail下書き作成（sendEmail=true の場合のみ）
  // ────────────────────────────────────────────────────────────
  let draftId: string | null = null;

  if (sendEmail) {
    console.log('📧 Gmail下書きを作成中...');
    
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN || !process.env.GMAIL_FROM) {
      console.warn('⚠️ Gmail認証情報が不足しています。下書き作成をスキップします。');
    } else {
      const gmail = createGmailClient();

      try {
        const profileRes = await gmail.users.getProfile({ userId: 'me' });
        console.log(`📬 下書き作成先: ${profileRes.data.emailAddress}`);
      } catch (err) {
        console.error('⚠️ Gmail認証情報の確認に失敗しました:', err);
      }

      const templateHtmlPath = resolve(process.cwd(), 'assets/email_template.html');
      let htmlBody = readFileSync(templateHtmlPath, 'utf-8');

      htmlBody = htmlBody
        .replace(/{{FACILITY_NAME}}/g, name!)
        .replace(/{{BUY_URL}}/g, buyUrl)
        .replace(/{{QR_URL}}/g, qrUrl)
        .replace(/{{PDF_URL}}/g, pdfUrl);

      const subject = `【SUGUKURU】スターターキット（QRコード） - ${name}`;

      const rawMessage = createMimeMessage(
        email!,
        process.env.GMAIL_FROM!,
        subject,
        htmlBody,
        pdfBuffer,
        qrBuffer,
      );

      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      try {
        const draftRes = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: {
              raw: encodedMessage,
            },
          },
        });

        draftId = draftRes.data.id ?? null;
        console.log(`✅ 下書き作成完了 (Draft ID: ${draftId})\n`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('❌ Gmail下書きの作成に失敗しました:', errMsg);
      }
    }
  } else {
    console.log('📧 Gmail下書き作成をスキップしました（--send-email false）\n');
  }

  // ────────────────────────────────────────────────────────────
  // K) 次の営業開始時刻を取得
  // ────────────────────────────────────────────────────────────
  let nextOpenAt: string | null = null;
  try {
    const { data: status } = await supabase.rpc('get_facility_status', {
      p_facility_id: facilityId,
    });
    if (status && status.next_open_at) {
      nextOpenAt = status.next_open_at;
    }
  } catch {
    // RPC がまだ存在しない場合は無視
  }

  // ────────────────────────────────────────────────────────────
  // L) 最終出力
  // ────────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 オンボード処理が完了しました！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`施設ID (facilityId): ${facilityId}`);
  console.log(`購入URL (buyUrl): ${buyUrl}`);
  console.log(`QR画像URL (qrUrl): ${qrUrl}`);
  console.log(`PDF URL (pdfUrl): ${pdfUrl}`);
  console.log(`公開 (is_published): ${publish}`);
  console.log(`営業時間枠 (open_intervals): ${openIntervals.length} 件`);
  console.log(`写真 (photos): ${photoUrls.length} 件`);
  if (nextOpenAt) {
    console.log(`次の営業開始 (next_open_at): ${nextOpenAt}`);
  }
  if (draftId) {
    console.log(`Gmail下書きID (draftId): ${draftId}`);
  }
  if (requestId) {
    console.log(`申請ステータス: approved`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('❌ 予期しないエラーが発生しました:', err);
  process.exit(1);
});
