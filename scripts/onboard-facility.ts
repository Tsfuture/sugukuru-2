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
// QR埋め込み位置/サイズ デフォルト値（pt単位）
// 微調整後は以下の定数を書き換えるか、CLI引数で上書き可能
// ────────────────────────────────────────────────────────────
const DEFAULT_QR_SIZE_PT = 180; // QRコードサイズ（正方形）
const DEFAULT_QR_X_PT = 207.75; // X座標（ページ幅 595.5 の中央寄せ: (595.5 - 180) / 2 ≒ 207.75）
const DEFAULT_QR_Y_PT = 280;   // Y座標（PDF下端からの距離pt）

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

// コマンドライン引数パース
interface ParsedArgs {
  name: string;
  email: string;
  storeId?: string;
  qrSize: number;
  qrX?: number;
  qrY: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<ParsedArgs> = {
    qrSize: DEFAULT_QR_SIZE_PT,
    qrY: DEFAULT_QR_Y_PT,
  };

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
      parsed.qrSize = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--qrX' && args[i + 1]) {
      parsed.qrX = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--qrY' && args[i + 1]) {
      parsed.qrY = Number(args[i + 1]);
      i++;
    }
  }

  if (!parsed.name || !parsed.email) {
    console.error('❌ 必須引数が不足しています。');
    console.error('使用方法:');
    console.error('  npm run onboard:facility -- --name "施設名" --email "担当者メール" [--storeId "uuid"]');
    console.error('');
    console.error('QR位置調整オプション:');
    console.error('  --qrSize <pt>  QRコードサイズ（デフォルト: 180）');
    console.error('  --qrX <pt>     X座標（デフォルト: 中央寄せ）');
    console.error('  --qrY <pt>     Y座標（デフォルト: 280）');
    process.exit(1);
  }

  return parsed as ParsedArgs;
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

  // 引数パース（QR位置オプション含む）
  const { name, email, storeId, qrSize, qrX, qrY } = parseArgs();
  console.log(`📝 施設名: ${name}`);
  console.log(`📧 メール: ${email}`);
  if (storeId) console.log(`🏪 店舗ID: ${storeId}`);
  console.log(`📐 QR設定: size=${qrSize}pt, x=${qrX ?? '中央寄せ'}, y=${qrY}pt`);
  console.log('');

  // B) Supabase接続
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // facilities に insert
  console.log('💾 施設をデータベースに登録中...');
  const { data: facility, error: insertError } = await supabase
    .from('facilities')
    .insert({
      name,
      contact_email: email,
      store_id: storeId || null,
    })
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
  const { error: storeUpsertError } = await supabase
    .from('stores')
    .upsert({
      id: facilityId,
      name,
      description: null,
      current_wait_time: 30,   // デフォルト待ち時間（分）
      fastpass_price: 1000,    // デフォルト価格（円）
      peak_extra_price: 0,     // ピーク時追加料金（円）
      is_open: true,
    }, { onConflict: 'id' });

  if (storeUpsertError) {
    console.error('⚠️ stores テーブルへの登録に失敗しました:', storeUpsertError);
    console.error('💡 stores テーブルが存在するか確認してください。導入店舗一覧には表示されません。');
    // 致命的エラーではないので続行
  } else {
    console.log('✅ stores テーブルに登録しました\n');
  }

  // C) buyUrl 生成（末尾スラッシュ除去）
  // Buy.tsx は store パラメータを優先で読むため、store= を使用
  const baseUrl = process.env.APP_BASE_URL!.replace(/\/$/, '');
  const buyUrl = `${baseUrl}/buy?store=${facilityId}`;
  console.log(`🔗 購入URL: ${buyUrl}`);

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

  // QR配置座標を計算（qrX未指定なら中央寄せ）
  const finalQrX = qrX ?? (pageWidth - qrSize) / 2;

  firstPage.drawImage(qrImage, {
    x: finalQrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  console.log(`✅ PDF生成完了（QR: x=${finalQrX.toFixed(1)}, y=${qrY}, size=${qrSize}）\n`);

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
