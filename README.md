# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/aa4e4981-d544-474e-9659-7d34485fc5cf

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/aa4e4981-d544-474e-9659-7d34485fc5cf) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/aa4e4981-d544-474e-9659-7d34485fc5cf) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## 環境変数の設定

### フロントエンド（Vite）

`.env.local` ファイルをプロジェクトルートに作成し、以下を設定してください：

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51SZqNfHvQRtWRDceYXjVBB0KxqyNMZqDY8PhsT8IXnRPljJriaBBOgIHjDoaAchSsVzBQonAV9PmgH9813Pwjydk00iI81H3nv
VITE_SUPABASE_URL=https://ghetymkklbfvczlvnxfu.supabase.co
<REDACTED_ANON_KEY>
```

### バックエンド（Supabase Edge Functions）

Supabase Edge Functionsに秘密鍵を設定するには、以下のコマンドを実行してください：

```bash
# Supabase CLIでログイン
supabase login

# プロジェクトをリンク
supabase link --project-ref ghetymkklbfvczlvnxfu

# Stripe Secret Keyを設定
# ⚠️ 実際のキーは Stripe Dashboard から取得し、直接コマンドに入力してください
# 絶対にキーをファイルやログに残さないこと！
supabase secrets set STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY>

# Edge Functionをデプロイ
supabase functions deploy stripe-setup-intent
supabase functions deploy setup-card
supabase functions deploy process-payment
```

## テスト方法（Stripe決済価格の確認）

`process-payment` Edge Function が DB の `stores.fastpass_price` を正しく使用しているかテストする方法：

### 1. DBで店舗の価格を確認・設定

```sql
-- 価格を確認
SELECT id, name, fastpass_price, peak_extra_price, is_open FROM stores;

-- 500円に設定する例
UPDATE stores SET fastpass_price = 500 WHERE id = 'your-store-id';
```

### 2. 購入テスト実行

1. UIで `fastpass_price = 500` の店舗を選択
2. `quantity = 1` で購入
3. Supabase Edge Function のログを確認：

```bash
supabase functions logs process-payment --project-ref ghetymkklbfvczlvnxfu
```

### 3. ログ出力例（期待される結果）

```
Price calculation {"base":500,"extra":0,"unitPrice":500,"quantity":1,"total":500}
[SECURITY] Price from DB - store: テスト店舗, basePrice: 500, dynamicFee: 0, unitPrice: 500, quantity: 1, totalAmount: 500
Creating PaymentIntent for 500 JPY
PaymentIntent created: pi_xxx, status: succeeded
```

### 4. Stripe Dashboard で確認

Stripe Dashboard > Payments で `amount = ¥500` になっていることを確認

### ピーク時間帯のテスト（18:00〜21:00 JST）

ピーク時間帯は `peak_extra_price` が加算されます：

```
Price calculation {"base":500,"extra":100,"unitPrice":600,"quantity":1,"total":600}
```

### セキュリティ注意事項

- `STRIPE_SECRET_KEY` は **絶対にフロントエンドに置かない**
- `STRIPE_SECRET_KEY` を **ログに出力しない**
- `.env.local` は **Gitにコミットしない**（.gitignoreで除外済み）

---

## Netlify デプロイ

### ビルド設定

- **Build command**: `npm run build`
- **Publish directory**: `dist`

### 必須環境変数（Netlify側で設定）

Netlify の **Site settings > Environment variables** で以下を設定してください：

| 変数名 | 説明 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase プロジェクトURL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key（公開可能） |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe 公開キー（pk_live_... or pk_test_...） |

⚠️ **注意**: Secret Key（sk_...）は Supabase Edge Functions の環境変数に設定します。Netlify には設定しないでください。

### SPA ルーティング対応

このリポジトリには SPA 用のリダイレクト設定が含まれています：

- `netlify.toml` - Netlify ビルド設定 + リダイレクトルール
- `public/_redirects` - フォールバック用リダイレクト設定

これにより `/buy`、`/auth/callback` などのルートを直接アクセスまたはリロードしても 404 にならず、正しく表示されます。

---

## 施設オンボード自動化

### 概要

新規施設を1コマンドでオンボード可能。以下を自動実行します：
- Supabase `facilities` テーブルへの登録
- QRコード生成 & Supabase Storage保存
- スターターキットPDF生成（QR合成） & Storage保存
- Gmail下書き作成（PDF/QR添付）

### 前提条件

#### 1. Supabase テーブル作成

以下のSQLをSupabase SQLエディタで実行してください：

```sql
-- facilitiesテーブル（存在しない場合）
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  store_id UUID REFERENCES stores(id),
  buy_url TEXT,
  qr_png_path TEXT,
  starter_pdf_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_facilities_updated_at
BEFORE UPDATE ON facilities
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

#### 2. Supabase Storage バケット作成

Supabase Dashboard > Storage で以下のバケットを作成してください：

- **バケット名**: `facility-assets`
- **Public**: ✅ ON（公開URLを取得するため）
- **用途**: QRコード画像とスターターキットPDFの保存

#### 3. テンプレートPDF配置

スターターキットのベースとなるPDFを以下のパスに配置してください：

```
assets/starter-kit-template.pdf
```

このPDFの1ページ目にQRコードが合成されます。

#### 4. 環境変数設定（.env.local）

`.env.example` を参考に、`.env.local` に以下を設定してください：

```env
# Supabase（サービスロールキー必須）
SUPABASE_URL=https://xxxx.supabase.co
<REDACTED_SERVICE_ROLE_KEY> # 管理者権限キー

# アプリケーションURL
APP_BASE_URL=https://your-app.netlify.app

# Gmail API認証情報（npm run gmail:auth で取得）
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GMAIL_REFRESH_TOKEN=1//xxx
GMAIL_FROM=your-email@gmail.com
```

⚠️ **注意**: `SUPABASE_SERVICE_ROLE_KEY` は管理者権限を持ちます。流出しないよう厳重に管理してください。

#### 5. Gmail認証（初回のみ）

Gmail下書き作成には認証が必要です。以下を実行してトークンを取得してください：

```bash
npm run gmail:auth
```

取得した `REFRESH_TOKEN` を `.env.local` の `GMAIL_REFRESH_TOKEN` に設定してください。

### 実行方法

依存関係をインストール後、以下のコマンドで施設をオンボードできます：

```bash
# 依存関係インストール（初回のみ）
npm install

# 施設オンボード実行
npm run onboard:facility -- --name "テスト施設" --email "担当者@example.com"

# 店舗IDを指定する場合
npm run onboard:facility -- --name "テスト施設" --email "担当者@example.com" --storeId "uuid-here"
```

#### QRコード位置調整

PDFに埋め込むQRコードの位置・サイズはCLI引数で調整できます：

```bash
npm run onboard:facility -- --name "施設名" --email "xxx@example.com" \
  --qrSize 180 \
  --qrX 207.75 \
  --qrY 280
```

| 引数 | 説明 | デフォルト |
|------|------|-----------|
| `--qrSize` | QRコードのサイズ（pt） | 180 |
| `--qrX` | X座標（pt, 左端基準） | 中央寄せ |
| `--qrY` | Y座標（pt, 下端基準） | 280 |

一度調整が完了したら、`scripts/onboard-facility.ts` 冒頭の定数を書き換えることで以後デフォルト値として使用されます。

### Cloudflare Pages への移行

Cloudflare Pages に移行する場合は、`.env.local` の `APP_BASE_URL` を Cloudflare の URL に変更してください：

```env
APP_BASE_URL=https://your-project.pages.dev
```

### 実行結果

成功すると以下が表示されます：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 オンボード処理が完了しました！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
施設ID (facilityId): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
購入URL (buyUrl): https://your-app.com/buy?store=xxx
QR画像URL (qrUrl): https://xxx.supabase.co/storage/v1/object/public/...
PDF URL (pdfUrl): https://xxx.supabase.co/storage/v1/object/public/...
Gmail下書きID (draftId): r123456789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Gmailの「下書き」フォルダに件名「【SUGUKURU】スターターキット（QRコード） - 施設名」のメールが作成されます。

### 導入店舗一覧への自動表示

オンボード時に `stores` テーブルへ自動的に upsert されます。これにより、トップページの「導入店舗」一覧に即座に表示されます。

- **stores.id**: facility ID と同じ値
- **stores.fastpass_price**: デフォルト 1000 円（後から Supabase Dashboard で変更可能）
- **stores.is_open**: デフォルト true

### トラブルシューティング

| エラー | 対処法 |
|--------|--------|
| 環境変数が不足 | `.env.local` に必要なキーをすべて設定してください |
| テンプレートPDFが見つからない | `assets/starter-kit-template.pdf` を配置してください |
| Storage バケット無し | Supabase Dashboardで `facility-assets` バケット（public）を作成してください |
| Gmail認証失敗 | `npm run gmail:auth` を実行してトークンを再取得してください |
| 導入店舗に表示されない | stores テーブルが存在するか確認。マイグレーション実行: `supabase db push` |

---

## 変更ファイル一覧（施設オンボード自動化関連）

| ファイル | 変更内容 |
|----------|----------|
| `scripts/onboard-facility.ts` | QR透明背景、PDF Title設定、stores自動登録、buyUrl修正 |
| `assets/starter-kit-template.pdf` | QR埋め込み用テンプレート（手動配置） |
| `assets/email_template.html` | Gmail下書き用HTMLテンプレート |
| `.env.example` | 必要な環境変数のサンプル |
| `README.md` | 本ドキュメント |

---

## クイックスタート（施設オンボード）

```bash
# 1. 依存関係インストール
npm install

# 2. 環境変数設定（.env.example を参考に .env.local を作成）

# 3. Gmail認証（初回のみ）
npm run gmail:auth

# 4. テンプレートPDF配置
# assets/starter-kit-template.pdf にPDFを配置

# 5. 施設オンボード実行
npm run onboard:facility -- --name "施設名" --email "xxx@example.com"

# QR位置調整が必要な場合
npm run onboard:facility -- --name "施設名" --email "xxx@example.com" \
  --qrSize 200 --qrX 197.75 --qrY 250
```

### <<手動>> が必要な作業

1. **Supabase Storage バケット作成**: `facility-assets`（public）
2. **テンプレートPDF配置**: `assets/starter-kit-template.pdf`
3. **環境変数設定（.env.local）**:
   - `APP_BASE_URL` を本番URLに変更（Cloudflare Pages等）
4. **Cloudflare Pages移行時**: `APP_BASE_URL=https://your-project.pages.dev`

