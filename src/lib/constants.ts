// ======================================================================
// SUGUKURU 共通定数ファイル
// 購入枚数上限、価格フォーマット等の定数を一元管理
// ======================================================================

/**
 * 1回の購入で選択可能な最大枚数
 * - UI（QuantitySelector）とバリデーションの両方でこの値を使用
 * - 変更する場合はここを編集するだけでOK
 */
export const MAX_QUANTITY_PER_PURCHASE = 50;

/**
 * 購入枚数の最小値
 */
export const MIN_QUANTITY_PER_PURCHASE = 1;

/**
 * 価格表示のプレースホルダー（読み込み中表示用）
 * - 実際の価格が確定するまではこれを表示しない（スケルトンUIを使用）
 */
export const PRICE_LOADING_PLACEHOLDER = "読み込み中...";

/**
 * Cloudflare Pages 本番URL（デフォルト値）
 * - 環境変数 VITE_PUBLIC_APP_URL で上書き可能
 * - フロントエンドで使用
 */
export const DEFAULT_APP_URL = "https://sugukuru-2.pages.dev";
