/**
 * returnTo ユーティリティ
 * 
 * 認証フロー中に元のページ（store付きURLなど）を保持し、
 * 認証完了後に確実に元のページへ戻すための仕組み。
 * 
 * 保持方法:
 * 1. sessionStorage: ブラウザセッション中は永続
 * 2. URLクエリパラメータ(next): リダイレクト時に引き継ぎ
 * 
 * 復帰優先順:
 * 1. URLの next パラメータ
 * 2. sessionStorage の returnTo
 * 3. デフォルト値（トップページ）
 */

const RETURN_TO_KEY = "sugukuru_returnTo";

/**
 * 現在のURL（pathname + search）をreturnToとして保存
 * 認証ページへ遷移する直前に呼び出す
 */
export function saveReturnTo(): void {
  const returnTo = window.location.pathname + window.location.search;
  sessionStorage.setItem(RETURN_TO_KEY, returnTo);
}

/**
 * 指定したパスをreturnToとして保存
 */
export function saveReturnToPath(path: string): void {
  // 安全対策: / から始まる内部パスのみ許可
  if (path.startsWith("/") && !path.startsWith("//")) {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  }
}

/**
 * 保存されたreturnToを取得
 * URLの next パラメータ → sessionStorage の優先順
 * @param searchParams URLSearchParams オブジェクト
 * @param defaultPath 見つからない場合のデフォルト値
 */
export function getReturnTo(
  searchParams?: URLSearchParams,
  defaultPath: string = "/"
): string {
  // 1. URLの next パラメータを優先
  if (searchParams) {
    const nextParam = searchParams.get("next");
    if (nextParam && isValidReturnTo(nextParam)) {
      return nextParam;
    }
  }

  // 2. sessionStorage をチェック
  const stored = sessionStorage.getItem(RETURN_TO_KEY);
  if (stored && isValidReturnTo(stored)) {
    return stored;
  }

  // 3. デフォルト値
  return defaultPath;
}

/**
 * returnToが有効な内部パスかチェック
 */
export function isValidReturnTo(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/**
 * sessionStorageのreturnToをクリア
 * 復帰完了後に呼び出す
 */
export function clearReturnTo(): void {
  sessionStorage.removeItem(RETURN_TO_KEY);
}

/**
 * 認証リダイレクトURL用のnextパラメータを構築
 * emailRedirectTo や OAuth redirectTo に使用
 * @param returnTo 認証完了後に戻るパス（デフォルトは現在のURL）
 */
export function buildAuthRedirectUrl(returnTo?: string): string {
  const origin = window.location.origin;
  
  // returnToが未指定の場合は sessionStorage から取得
  let effectiveReturnTo = returnTo;
  if (!effectiveReturnTo) {
    effectiveReturnTo = sessionStorage.getItem(RETURN_TO_KEY) || "/";
  }
  
  // 安全対策
  if (!isValidReturnTo(effectiveReturnTo)) {
    effectiveReturnTo = "/";
  }

  return `${origin}/auth/callback?next=${encodeURIComponent(effectiveReturnTo)}`;
}

/**
 * カード登録完了後のリダイレクト先を取得
 * returnToがあればそれを使用、なければ /buy（store付き）にフォールバック
 */
export function getPostCardSetupRedirect(
  searchParams?: URLSearchParams,
  fallbackStore?: string
): string {
  // まずreturnToを確認
  const returnTo = getReturnTo(searchParams);
  
  // returnToが "/" 以外なら使用
  if (returnTo !== "/") {
    return returnTo;
  }
  
  // フォールバック: store があれば /buy?store=... へ
  if (fallbackStore) {
    return `/buy?store=${encodeURIComponent(fallbackStore)}`;
  }
  
  return "/";
}
