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

---

## 購入枚数上限テスト手順（MAX_GROUP_SIZE = 50）

### 変更概要（2026-01-03 実施）

購入枚数の上限を6枚から50枚に変更しました。

**影響箇所:**
- `supabase/functions/process-payment/index.ts` - バックエンド検証（1〜50枚）
- `src/lib/constants.ts` - 定数定義 `MAX_GROUP_SIZE = 50`
- `src/pages/Buy.tsx` - フロントエンド QuantitySelector の上限
- `src/pages/TempTicket.tsx` - エラーメッセージ、フッター文言
- `src/locales/*.json` - 全7言語の文言
- `supabase/migrations/20260103000000_increase_quantity_limit_to_50.sql` - DB制約

### テスト手順

1. **フロントエンド確認**
   ```sh
   npm run dev
   ```
   - `/buy?store=<store_id>` にアクセス
   - 数量セレクタで 1〜50 が選択可能なことを確認
   - 51以上は選択できないことを確認

2. **1枚での購入テスト**
   - 数量1で購入フローを完了
   - 決済が成功することを確認

3. **7枚での購入テスト（以前は失敗していた）**
   - 数量7で購入フローを完了
   - 決済が成功することを確認（以前は「決済API エラー」が発生）

4. **50枚での購入テスト**
   - 数量50で購入フローを完了
   - 決済が成功することを確認

5. **51枚での拒否テスト（API直接呼び出し）**
   ```sh
   # Edge Function を直接呼び出して 51枚が拒否されることを確認
   curl -X POST https://<project_ref>.supabase.co/functions/v1/process-payment \
     -H "Authorization: Bearer <anon_key>" \
     -H "Content-Type: application/json" \
     -d '{"facilityId":"test-store","quantity":51,"orderKey":"test-key"}'
   ```
   - HTTP 400 + `{"error":"購入枚数は1〜50枚の範囲で指定してください","code":"INVALID_QUANTITY"}` が返ることを確認

6. **DB制約の適用**
   ```sh
   # Supabase CLI でマイグレーションを実行
   npx supabase db push
   # または手動で SQL を実行
   ```

### セキュリティ注意事項

- `STRIPE_SECRET_KEY` は **絶対にフロントエンドに置かない**
- `STRIPE_SECRET_KEY` を **ログに出力しない**
- `.env.local` は **Gitにコミットしない**（.gitignoreで除外済み）

---

## 購入導線 returnTo 保持の仕組み（2026-01-03 実装）

### 概要

認証フロー（ログイン/新規登録/メール認証/カード登録）を経ても、元の購入導線（`/buy?store=xxx` や `/temp-ticket?store=xxx`）へ確実に戻るための仕組みです。

### 保持方法

1. **sessionStorage** - ブラウザセッション中は永続
2. **URLクエリパラメータ（next）** - リダイレクト時に引き継ぎ

### 復帰優先順

1. URLの `next` パラメータ
2. sessionStorage の `sugukuru_returnTo`
3. デフォルト値（`/` またはカード未登録なら `/card-setup`）

### 実装ファイル

- `src/lib/returnTo.ts` - ユーティリティ関数（saveReturnTo, getReturnTo, clearReturnTo）
- `src/pages/Buy.tsx` - 認証遷移前に `saveReturnTo()` を呼び出し
- `src/pages/Auth.tsx` - `getReturnTo()` で復帰先を取得、OTP/OAuth に渡す
- `src/hooks/useAuth.tsx` - `buildAuthRedirectUrl()` で認証リダイレクトURLを構築
- `src/pages/AuthCallback.tsx` - 認証完了後に `getReturnTo()` → `clearReturnTo()` → navigate
- `src/pages/CardSetup.tsx` - カード登録完了後に `getPostSetupRedirect()` → `clearReturnTo()` → navigate

---

## returnTo 動作確認 テスト手順

### パターン1: 新規登録 → メール認証 → カード登録 → 購入完了

1. シークレットウィンドウで `/buy?store=<store_id>&quantity=2` にアクセス
2. 「購入へ進む」をタップ → `/auth` に遷移
3. メールアドレスを入力して「認証メールを送信」
4. 受信したメールのリンクをクリック → `/auth/callback?next=...` に遷移
5. カード未登録なら `/card-setup` へ自動遷移
6. カード情報を入力して「このカードを登録する」
7. **期待結果**: `/temp-ticket?store=<store_id>&quantity=2&unitPrice=...` に遷移

### パターン2: ログイン済み・カード未登録 → カード登録 → 購入完了

1. ログイン済みだがカード未登録のアカウントで `/buy?store=<store_id>` にアクセス
2. 「購入へ進む」をタップ → `/card-setup` に遷移
3. カード情報を入力して「このカードを登録する」
4. **期待結果**: 元の購入導線（`/temp-ticket?store=<store_id>...`）に遷移

### パターン3: OAuth（Google等）ログイン → 購入完了

1. シークレットウィンドウで `/buy?store=<store_id>` にアクセス
2. 「購入へ進む」をタップ → `/auth` に遷移
3. 「Googleで続行」をタップ → Google認証
4. 認証完了後 `/auth/callback?next=...` → 必要に応じて `/card-setup` へ
5. カード登録後 → **期待結果**: 元の `/temp-ticket?store=<store_id>...` に遷移

### 確認ポイント

- すべてのパターンで `store` パラメータが失われないこと
- 「店舗が選択されていません」エラーが表示されないこと
- UI/レイアウトに変更がないこと

