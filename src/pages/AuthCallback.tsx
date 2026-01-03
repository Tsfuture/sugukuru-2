import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getReturnTo, clearReturnTo } from "@/lib/returnTo";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // returnTo を取得（URL next パラメータ → sessionStorage → デフォルト "/"）
        const next = getReturnTo(searchParams, "/");
        
        // 復帰先が決まったらsessionStorageをクリア
        const navigateAndClear = (path: string) => {
          clearReturnTo();
          navigate(path, { replace: true });
        };

        // code パラメータを確認（PKCE フロー）
        const code = searchParams.get("code");

        if (code) {
          // PKCE フロー: code を使ってセッションを取得
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("exchangeCodeForSession error:", exchangeError);
            setError(`認証に失敗しました: ${exchangeError.message}`);
            setIsProcessing(false);
            return;
          }
          navigateAndClear(next);
          return;
        }

        // hash フラグメントを確認（Implicit フロー）
        const hash = window.location.hash;
        if (hash) {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) {
              console.error("setSession error:", sessionError);
              setError(`セッションの設定に失敗しました: ${sessionError.message}`);
              setIsProcessing(false);
              return;
            }
            navigateAndClear(next);
            return;
          }
        }

        // code も hash もない場合、セッションを確認
        const { data: { session }, error: sessionCheckError } = await supabase.auth.getSession();
        if (sessionCheckError) {
          console.error("getSession error:", sessionCheckError);
          setError(`セッションの取得に失敗しました: ${sessionCheckError.message}`);
          setIsProcessing(false);
          return;
        }

        if (session) {
          // 既にセッションがある場合は遷移
          navigateAndClear(next);
          return;
        }

        // セッションがない場合はエラー表示
        setError("認証情報が見つかりませんでした。再度ログインしてください。");
        setIsProcessing(false);
      } catch (err) {
        console.error("Auth callback error:", err);
        setError("認証処理中にエラーが発生しました。");
        setIsProcessing(false);
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center">
              <div className="text-red-500 text-5xl mb-4">⚠️</div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">認証エラー</h1>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={() => navigate("/auth", { replace: true })}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                ログインページへ戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">認証処理中...</p>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthCallback;
