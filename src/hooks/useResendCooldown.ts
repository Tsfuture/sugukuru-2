import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "auth_resend_available_at";
const DEFAULT_COOLDOWN_SECONDS = 60;

interface UseResendCooldownReturn {
  /** 残りクールダウン秒数 (0の場合は送信可能) */
  remaining: number;
  /** クールダウン中かどうか */
  isCoolingDown: boolean;
  /** クールダウンを開始 (秒数指定、デフォルト60秒) */
  startCooldown: (seconds?: number) => void;
  /** エラーメッセージから秒数をパースしてクールダウン開始 */
  handleRateLimitError: (errorMessage: string) => number | null;
  /** クールダウンをクリア */
  clearCooldown: () => void;
}

/**
 * エラーメッセージから "after XX seconds" の秒数を抽出
 * 例: "For security purposes, you can only request this after 47 seconds"
 */
function parseSecondsFromError(message: string): number | null {
  const match = message.match(/after\s+(\d+)\s+seconds?/i);
  if (match && match[1]) {
    const seconds = parseInt(match[1], 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return null;
}

/**
 * 認証メール再送のクールダウン管理フック
 * - localStorageで永続化（ページリロードでも維持）
 * - レート制限エラーからの秒数パース
 * - 自動カウントダウン
 */
export function useResendCooldown(): UseResendCooldownReturn {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // localStorage から復元
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const availableAt = parseInt(stored, 10);
      if (!isNaN(availableAt)) {
        const now = Date.now();
        const diff = Math.ceil((availableAt - now) / 1000);
        if (diff > 0) {
          setRemaining(diff);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, []);

  // カウントダウン処理
  useEffect(() => {
    if (remaining > 0) {
      intervalRef.current = window.setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            localStorage.removeItem(STORAGE_KEY);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [remaining > 0]); // remaining > 0 が変わった時のみ再実行

  const startCooldown = useCallback((seconds: number = DEFAULT_COOLDOWN_SECONDS) => {
    const availableAt = Date.now() + seconds * 1000;
    localStorage.setItem(STORAGE_KEY, availableAt.toString());
    setRemaining(seconds);
  }, []);

  const handleRateLimitError = useCallback((errorMessage: string): number | null => {
    const seconds = parseSecondsFromError(errorMessage);
    if (seconds !== null) {
      startCooldown(seconds);
      return seconds;
    }
    // 秒数がパースできない場合はフォールバック
    startCooldown(DEFAULT_COOLDOWN_SECONDS);
    return DEFAULT_COOLDOWN_SECONDS;
  }, [startCooldown]);

  const clearCooldown = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRemaining(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return {
    remaining,
    isCoolingDown: remaining > 0,
    startCooldown,
    handleRateLimitError,
    clearCooldown,
  };
}
