import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n"; // i18n 初期化
import { validateSupabaseEnv } from "./integrations/supabase/client";

// 環境変数チェック（Supabase接続に必須）
const envCheck = validateSupabaseEnv();
if (!envCheck.valid) {
  const root = document.getElementById("root")!;
  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif; padding: 20px; text-align: center; background: #fef2f2;">
      <div style="background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px;">
        <h1 style="color: #dc2626; margin-bottom: 16px; font-size: 24px;">⚠️ 環境変数エラー</h1>
        <p style="color: #374151; margin-bottom: 12px;">以下の環境変数が設定されていません:</p>
        <ul style="color: #991b1b; list-style: none; padding: 0; margin-bottom: 20px;">
          ${envCheck.missing.map(v => `<li style="margin: 8px 0;"><code style="background: #fee2e2; padding: 4px 12px; border-radius: 6px; font-size: 14px;">${v}</code></li>`).join('')}
        </ul>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: left;">
          <p style="color: #374151; font-size: 14px; margin-bottom: 8px; font-weight: 600;">Vercel での設定手順:</p>
          <ol style="color: #6b7280; font-size: 13px; padding-left: 20px; margin: 0;">
            <li style="margin: 4px 0;">Vercel Dashboard → Settings → Environment Variables</li>
            <li style="margin: 4px 0;">上記の変数を Production 環境に追加</li>
            <li style="margin: 4px 0;">Redeploy を実行</li>
          </ol>
        </div>
      </div>
    </div>
  `;
  console.error("[supabase] Missing environment variables:", envCheck.missing);
  console.error("[supabase] Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Environment Variables");
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
