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
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZXR5bWtrbGJmdmN6bHZueGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzA0MTEsImV4cCI6MjA4MDc0NjQxMX0.ApMT9psLxagTZpb9Xd5Oz7mg5XV_SnQvSrNC4BZwY34
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

