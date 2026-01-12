#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { google } from 'googleapis';

// .env.local を最初に読み込む
config({ path: resolve(process.cwd(), '.env.local') });

// ────────────────────────────────────────────────────────────
// Cloudflare Pages 本番URL（QRコードのリンク先として使用）
// 環境変数 CLOUDFLARE_PROD_ORIGIN で上書き可能
// ────────────────────────────────────────────────────────────
const CLOUDFLARE_PROD_ORIGIN = process.env.CLOUDFLARE_PROD_ORIGIN || 'https://sugukuru-2.pages.dev';

// ────────────────────────────────────────────────────────────
// QR Safe Box 配置定数（pt単位）
// "Purchase your FastPass here" テキスト下端〜SUGUKURUロゴ上端の
// 安全領域内でQRを最大正方形で中央配置する方式
// ────────────────────────────────────────────────────────────
// [重要] テキストとの被りを完全に防ぐため、以下のルールに従う：
// 1. SAFE_BOX_TOP_Y より上にQRは配置しない（テキスト領域）
// 2. SAFE_BOX_BOTTOM_Y より下にQRは配置しない（ロゴ領域）
// 3. 左右は SAFE_BOX_SIDE_MARGIN を確保
// ────────────────────────────────────────────────────────────
const PAGE_WIDTH_PT = 595.5;      // A4幅
const PAGE_HEIGHT_PT = 842.25;    // A4高さ（参照用）

// Safe Box 上端Y（PDF下端からの距離）
// "Purchase your FastPass here" テキストの下端より十分下に設定
// 実測値530ptから30pt下げて500ptを上限とする（フォント差吸収）
const SAFE_BOX_TOP_Y_PT = 500;

// Safe Box 下端Y（PDF下端からの距離）
// SUGUKURUロゴ上端より十分上に設定
// 実測値150ptから20pt上げて170ptを下限とする
const SAFE_BOX_BOTTOM_Y_PT = 170;

// Safe Box 左右マージン（ページ端からの距離）
const SAFE_BOX_SIDE_MARGIN_PT = 80;

// PDF メタデータ
const PDF_TITLE = 'SUGUKURU スターターキット';
// Gmail添付ファイル名
const ATTACHMENT_FILENAME = 'SUGUKURU スターターキット.pdf';

// 必須環境変数のチェック
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_BASE_URL',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_FROM',
];

function checkEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ 環境変数が不足しています。.env.local に以下を設定してください:');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('\n.env.example を参照してください。');
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────
// Typeform Submission から取得する追加フィールド
// ────────────────────────────────────────────────────────────
interface TypeformExtendedFields {
  priceMinYen?: number | null;
  priceMaxYen?: number | null;
  category?: string | null;
  address?: string | null;
  hoursMode?: 'common' | 'weekly' | null;
  hoursCommon?: { start: string; end: string } | null;
  hoursWeekly?: Record<string, { start: string | null; end: string | null }> | null;
  photoUrls?: string[];
  submissionId?: string;  // 処理後に更新するため
}

// コマンドライン引数パース
interface ParsedArgs {
  name: string;
  email: string;
  storeId?: string;
  qrSizeOverride?: number;  // オーバーライド用（通常は自動計算）
  qrXOverride?: number;     // オーバーライド用
  qrYOverride?: number;     // オーバーライド用
  // Typeform連携オプション
  fromTypeform?: string;    // 'latest' または response_id
  // Typeformから取得した追加フィールド
  extended?: TypeformExtendedFields;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<ParsedArgs> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      parsed.name = args[i + 1];
      i++;
    } else if (args[i] === '--email' && args[i + 1]) {
      parsed.email = args[i + 1];
      i++;
    } else if (args[i] === '--storeId' && args[i + 1]) {
      parsed.storeId = args[i + 1];
      i++;
    } else if (args[i] === '--qrSize' && args[i + 1]) {
      parsed.qrSizeOverride = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--qrX' && args[i + 1]) {
      parsed.qrXOverride = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--qrY' && args[i + 1]) {
      parsed.qrYOverride = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--from-typeform' && args[i + 1]) {
      parsed.fromTypeform = args[i + 1];
      i++;
    }
  }

  // --from-typeformがある場合は name/email は後で取得するので必須チェックをスキップ
  if (!parsed.fromTypeform && (!parsed.name || !parsed.email)) {
    console.error('❌ 必須引数が不足しています。');
    console.error('使用方法:');
    console.error('  npm run onboard:facility -- --name "施設名" --email "担当者メール" [--storeId "uuid"]');
    console.error('');
    console.error('Typeform連携オプション:');
    console.error('  --from-typeform latest       : pendingの最新1件を取得して正式導入');
    console.error('  --from-typeform <response_id>: 指定response_idのpendingを導入');
    console.error('');
    console.error('QR位置調整オプション（通常は自動計算）:');
    console.error('  --qrSize <pt>  QRコードサイズ（オーバーライド用）');
    console.error('  --qrX <pt>     X座標（オーバーライド用）');
    console.error('  --qrY <pt>     Y座標（オーバーライド用）');
    process.exit(1);
  }

  return parsed as ParsedArgs;
}

// ────────────────────────────────────────────────────────────
// Typeform Submission を取得
// ────────────────────────────────────────────────────────────
interface FacilityOnboardingSubmission {
  id: string;
  response_id: string;
  facility_name: string;
  contact_email: string;
  price_min_yen: number | null;
  price_max_yen: number | null;
  category: string | null;
  address: string | null;
  hours_mode: 'common' | 'weekly' | null;
  hours_common: { start: string; end: string } | null;
  hours_weekly: Record<string, { start: string | null; end: string | null }> | null;
  photo_urls: string[];
  status: string;
}

// Supabase Client の型（緩い型定義でスクリプトの柔軟性を確保）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = ReturnType<typeof createClient<any, any>>;

async function fetchTypeformSubmission(
  supabase: SupabaseClientType,
  fromTypeform: string
): Promise<FacilityOnboardingSubmission | null> {
  let query = supabase
    .from('facility_onboarding_submissions')
    .select('*')
    .eq('status', 'pending');

  if (fromTypeform === 'latest') {
    // 最新1件を取得
    query = query.order('created_at', { ascending: false }).limit(1);
  } else {
    // 指定response_idを取得
    query = query.eq('response_id', fromTypeform);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Typeform submissionの取得に失敗しました:', error);
    return null;
  }

  if (!data || data.length === 0) {
    console.error('❌ 該当するpending状態のsubmissionが見つかりません');
    if (fromTypeform !== 'latest') {
      console.error(`   response_id: ${fromTypeform}`);
    }
    return null;
  }

  return data[0] as FacilityOnboardingSubmission;
}

// ────────────────────────────────────────────────────────────
// Submission を processed に更新
// ────────────────────────────────────────────────────────────
async function markSubmissionProcessed(
  supabase: SupabaseClientType,
  submissionId: string,
  facilityId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('facility_onboarding_submissions')
    .update({
      status: 'processed',
      processed_facility_id: facilityId,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (error) {
    console.error('⚠️ submission statusの更新に失敗しました:', error);
    return false;
  }

  return true;
}

// Gmail OAuth2クライアント作成
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

// MIMEメッセージ作成（添付ファイル付き）
function createMimeMessage(
  to: string,
  from: string,
  subject: string,
  htmlBody: string,
  pdfBuffer: Buffer,
  qrBuffer: Buffer,
  _facilityName: string // 互換性のため引数は残すが未使用
): string {
  const boundary = '----=_Part_' + Date.now();
  const attachmentBoundary = '----=_Attachment_' + Date.now();

  // RFC 2047 エンコード（日本語ファイル名対応）
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

async function main() {
  console.log('🚀 施設オンボード処理を開始します...\n');

  // A) 環境変数チェック
  checkEnvVars();

  // 引数パース
  let parsedArgs = parseArgs();
  
  // B) Supabase接続（先に接続しておく）
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ────────────────────────────────────────────────────────────
  // --from-typeform オプション処理
  // Typeform submissionから施設情報を取得
  // ────────────────────────────────────────────────────────────
  if (parsedArgs.fromTypeform) {
    console.log(`📋 Typeform submissionを取得中... (${parsedArgs.fromTypeform})`);
    
    const submission = await fetchTypeformSubmission(supabase, parsedArgs.fromTypeform);
    if (!submission) {
      process.exit(1);
    }

    console.log(`✅ Submission取得成功: ${submission.facility_name}`);
    console.log(`   response_id: ${submission.response_id}`);
    console.log('');

    // 取得した情報でparsedArgsを上書き
    parsedArgs = {
      ...parsedArgs,
      name: submission.facility_name,
      email: submission.contact_email,
      extended: {
        priceMinYen: submission.price_min_yen,
        priceMaxYen: submission.price_max_yen,
        category: submission.category,
        address: submission.address,
        hoursMode: submission.hours_mode,
        hoursCommon: submission.hours_common,
        hoursWeekly: submission.hours_weekly,
        photoUrls: submission.photo_urls || [],
        submissionId: submission.id,
      },
    };
  }

  const { name, email, storeId, qrSizeOverride, qrXOverride, qrYOverride, extended } = parsedArgs;

  console.log(`📝 施設名: ${name}`);
  console.log(`📧 メール: ${email}`);
  if (storeId) console.log(`🏪 店舗ID: ${storeId}`);
  if (extended) {
    if (extended.priceMinYen || extended.priceMaxYen) {
      console.log(`💰 価格レンジ: ¥${extended.priceMinYen ?? '?'} 〜 ¥${extended.priceMaxYen ?? '?'}`);
    }
    if (extended.category) console.log(`🏷️  カテゴリ: ${extended.category}`);
    if (extended.address) console.log(`📍 住所: ${extended.address}`);
    if (extended.hoursMode) console.log(`⏰ 営業時間モード: ${extended.hoursMode}`);
    if (extended.photoUrls && extended.photoUrls.length > 0) {
      console.log(`📷 写真URL: ${extended.photoUrls.length}件`);
    }
  }
  console.log('');

  // facilities に insert
  console.log('💾 施設をデータベースに登録中...');
  const facilityInsertData: Record<string, unknown> = {
    name,
    contact_email: email,
    store_id: storeId || null,
  };

  // Typeformからの追加フィールドを設定
  if (extended) {
    if (extended.priceMinYen !== undefined && extended.priceMinYen !== null) {
      facilityInsertData.price_min_yen = extended.priceMinYen;
    }
    if (extended.priceMaxYen !== undefined && extended.priceMaxYen !== null) {
      facilityInsertData.price_max_yen = extended.priceMaxYen;
    }
    if (extended.category) {
      facilityInsertData.category = extended.category;
    }
    if (extended.address) {
      facilityInsertData.address = extended.address;
    }
    if (extended.hoursMode) {
      facilityInsertData.hours_mode = extended.hoursMode;
    }
    if (extended.hoursCommon) {
      facilityInsertData.hours_common = extended.hoursCommon;
    }
    if (extended.hoursWeekly) {
      facilityInsertData.hours_weekly = extended.hoursWeekly;
    }
    if (extended.photoUrls && extended.photoUrls.length > 0) {
      facilityInsertData.photo_urls = extended.photoUrls;
    }
  }

  const { data: facility, error: insertError } = await supabase
    .from('facilities')
    .insert(facilityInsertData)
    .select('id')
    .single();

  if (insertError || !facility) {
    console.error('❌ 施設の登録に失敗しました:', insertError);
    process.exit(1);
  }

  const facilityId = facility.id;
  console.log(`✅ 施設ID: ${facilityId}\n`);

  // ────────────────────────────────────────────────────────────
  // stores テーブルへの upsert（導入店舗一覧に表示されるため必須）
  // ────────────────────────────────────────────────────────────
  console.log('💾 stores テーブルに登録中（導入店舗一覧表示用）...');

  // 価格設定: Typeformから取得した場合はmin_price/max_priceを使用
  const storeData: Record<string, unknown> = {
    id: facilityId,
    name,
    description: null,
    current_wait_time: 30,   // デフォルト待ち時間（分）
    fastpass_price: 1000,    // デフォルト価格（円）
    peak_extra_price: 0,     // ピーク時追加料金（円）
    is_open: true,
  };

  // Typeformからの追加フィールドをstoresにも設定
  if (extended) {
    if (extended.priceMinYen !== undefined && extended.priceMinYen !== null) {
      storeData.price_min_yen = extended.priceMinYen;
      storeData.min_price = extended.priceMinYen;  // ダイナミックプライシング用
    }
    if (extended.priceMaxYen !== undefined && extended.priceMaxYen !== null) {
      storeData.price_max_yen = extended.priceMaxYen;
      storeData.max_price = extended.priceMaxYen;  // ダイナミックプライシング用
    }
    if (extended.category) {
      storeData.category = extended.category;
    }
    if (extended.address) {
      storeData.address = extended.address;
    }
    if (extended.hoursMode) {
      storeData.hours_mode = extended.hoursMode;
    }
    if (extended.hoursCommon) {
      storeData.hours_common = extended.hoursCommon;
    }
    if (extended.hoursWeekly) {
      storeData.hours_weekly = extended.hoursWeekly;
    }
    if (extended.photoUrls && extended.photoUrls.length > 0) {
      storeData.photo_urls = extended.photoUrls;
    }
  }

  const { error: storeUpsertError } = await supabase
    .from('stores')
    .upsert(storeData, { onConflict: 'id' });

  if (storeUpsertError) {
    console.error('⚠️ stores テーブルへの登録に失敗しました:', storeUpsertError);
    console.error('💡 stores テーブルが存在するか確認してください。導入店舗一覧には表示されません。');
    // 致命的エラーではないので続行
  } else {
    console.log('✅ stores テーブルに登録しました\n');
  }

  // C) buyUrl 生成
  // QRコードのリンク先はCloudflare Pages本番URLを使用
  // Buy.tsx は store パラメータを優先で読むため、store= を使用
  const qrBaseUrl = CLOUDFLARE_PROD_ORIGIN.replace(/\/$/, '');
  const buyUrl = `${qrBaseUrl}/buy?store=${facilityId}`;
  console.log(`🔗 購入URL（QRリンク先）: ${buyUrl}`);
  console.log(`📍 Cloudflare本番URL: ${CLOUDFLARE_PROD_ORIGIN}`);

  // D) QR生成（PNG、透明背景）
  console.log('📱 QRコードを生成中（透明背景）...');
  const qrBuffer = await QRCode.toBuffer(buyUrl, {
    type: 'png',
    width: 512,
    margin: 0,
    color: {
      dark: '#000000',  // QRコード部分は黒
      light: '#0000',   // 背景は透明（RGBA形式で alpha=0）
    },
  });
  console.log('✅ QRコード生成完了\n');

  // E) Storage にQRアップロード
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

  // F) PDF生成（テンプレにQR合成）
  console.log('📄 スターターキットPDFを生成中...');
  const templatePath = resolve(process.cwd(), 'assets/starter-kit-template.pdf');

  if (!existsSync(templatePath)) {
    console.error('❌ テンプレートPDFが見つかりません。');
    console.error(`💡 以下のパスにPDFを配置してください: ${templatePath}`);
    process.exit(1);
  }

  const templateBytes = readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);

  // PDF メタデータ設定
  pdfDoc.setTitle(PDF_TITLE);

  // QR画像をPDFに埋め込み
  const qrImage = await pdfDoc.embedPng(qrBuffer);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const pageWidth = firstPage.getWidth();
  const pageHeight = firstPage.getHeight();

  // ────────────────────────────────────────────────────────────
  // QR Safe Box 配置ロジック
  // [重要] テキストとの被りを完全に防ぐ固定ルール:
  // - Safe Box上限: SAFE_BOX_TOP_Y_PT（QR上端はこれ以下）
  // - Safe Box下限: SAFE_BOX_BOTTOM_Y_PT（QR下端はこれ以上）
  // - 左右マージン: SAFE_BOX_SIDE_MARGIN_PT
  // - この範囲内で最大正方形を中央配置
  // ────────────────────────────────────────────────────────────
  
  // Safe Box の縦幅（上限Y - 下限Y）
  const safeBoxHeight = SAFE_BOX_TOP_Y_PT - SAFE_BOX_BOTTOM_Y_PT;
  
  // Safe Box の横幅（ページ幅 - 左右マージン×2）
  const safeBoxWidth = pageWidth - (2 * SAFE_BOX_SIDE_MARGIN_PT);
  
  // 最大正方形サイズ = min(横幅, 縦幅)（オーバーライドがあればそちらを使用）
  const qrSize = qrSizeOverride ?? Math.min(safeBoxWidth, safeBoxHeight);
  
  // X座標: Safe Box内で水平中央
  // boxLeft = SAFE_BOX_SIDE_MARGIN_PT
  // x = boxLeft + (boxWidth - size) / 2
  const qrX = qrXOverride ?? (SAFE_BOX_SIDE_MARGIN_PT + (safeBoxWidth - qrSize) / 2);
  
  // Y座標: Safe Box内で垂直中央
  // boxBottom = SAFE_BOX_BOTTOM_Y_PT
  // y = boxBottom + (boxHeight - size) / 2
  const qrY = qrYOverride ?? (SAFE_BOX_BOTTOM_Y_PT + (safeBoxHeight - qrSize) / 2);
  
  console.log(`📐 QR Safe Box 配置計算:`);
  console.log(`   - ページサイズ: ${pageWidth.toFixed(1)} x ${pageHeight.toFixed(1)} pt`);
  console.log(`   - Safe Box 上限Y: ${SAFE_BOX_TOP_Y_PT} pt（これより上はテキスト領域）`);
  console.log(`   - Safe Box 下限Y: ${SAFE_BOX_BOTTOM_Y_PT} pt（これより下はロゴ領域）`);
  console.log(`   - Safe Box サイズ: ${safeBoxWidth.toFixed(1)} x ${safeBoxHeight.toFixed(1)} pt`);
  console.log(`   - QRサイズ: ${qrSize.toFixed(1)} pt (正方形)`);
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

  // G) Storage にPDFアップロード
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

  // H) facilities を update（URL情報を保存）
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

  // I) Gmail下書き作成
  console.log('📧 Gmail下書きを作成中...');
  const gmail = createGmailClient();

  // 認証中のアカウント確認
  try {
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    console.log(`📬 下書き作成先: ${profileRes.data.emailAddress}`);
  } catch (err) {
    console.error('⚠️ Gmail認証情報の確認に失敗しました:', err);
  }

  // メール本文作成（HTMLテンプレート読み込み）
  const templateHtmlPath = resolve(process.cwd(), 'assets/email_template.html');
  let htmlBody = readFileSync(templateHtmlPath, 'utf-8');

  htmlBody = htmlBody
    .replace(/{{FACILITY_NAME}}/g, name)
    .replace(/{{BUY_URL}}/g, buyUrl)
    .replace(/{{QR_URL}}/g, qrUrl)
    .replace(/{{PDF_URL}}/g, pdfUrl);

  const subject = `【SUGUKURU】スターターキット（QRコード） - ${name}`;

  const rawMessage = createMimeMessage(
    email,
    process.env.GMAIL_FROM!,
    subject,
    htmlBody,
    pdfBuffer,
    qrBuffer,
    name.replace(/[^a-zA-Z0-9]/g, '_')
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

    const draftId = draftRes.data.id;
    console.log(`✅ 下書き作成完了 (Draft ID: ${draftId})\n`);

    // J) 最終出力
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 オンボード処理が完了しました！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`施設ID (facilityId): ${facilityId}`);
    console.log(`購入URL (buyUrl): ${buyUrl}`);
    console.log(`QR画像URL (qrUrl): ${qrUrl}`);
    console.log(`PDF URL (pdfUrl): ${pdfUrl}`);
    console.log(`Gmail下書きID (draftId): ${draftId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // K) Typeform submissionをprocessedに更新
    if (extended?.submissionId) {
      console.log('📋 Typeform submissionを処理済みに更新中...');
      const updated = await markSubmissionProcessed(supabase, extended.submissionId, facilityId);
      if (updated) {
        console.log('✅ Submission status を processed に更新しました\n');
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = err instanceof Error && 'code' in err ? (err as { code?: number }).code : undefined;
    console.error('❌ Gmail下書きの作成に失敗しました:', errMsg);
    if (errCode === 401) {
      console.error('💡 Gmail認証トークンが無効です。npm run gmail:auth を実行してください。');
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ 予期しないエラーが発生しました:', err);
  process.exit(1);
});
