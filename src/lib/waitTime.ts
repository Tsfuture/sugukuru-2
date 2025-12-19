// 待ち時間計算ロジック
// 将来的にはAPIやリアルタイムデータから取得可能

/**
 * 現在の想定待ち時間を計算する
 * @param facilityId - 施設ID
 * @param quantity - 人数
 * @returns 待ち時間の範囲（分）
 */
export function calcEstimatedWaitTime(facilityId: string, quantity: number): { min: number; max: number } {
  // 基本待ち時間（施設ごとに異なる）
  const baseWaitTimes: Record<string, { min: number; max: number }> = {
    default: { min: 10, max: 20 },
    "store-a": { min: 15, max: 25 },
    "store-b": { min: 20, max: 35 },
    "theme-park": { min: 30, max: 60 },
  };

  const base = baseWaitTimes[facilityId] || baseWaitTimes.default;
  
  // 人数による追加時間（1人あたり約2分追加）
  const additionalTime = (quantity - 1) * 2;

  return {
    min: base.min + additionalTime,
    max: base.max + additionalTime,
  };
}

/**
 * 待ち時間を表示用文字列に変換
 * @param waitTime - 待ち時間オブジェクト
 * @returns 表示用文字列
 */
export function formatWaitTime(waitTime: { min: number; max: number }): string {
  return `${waitTime.min}〜${waitTime.max}分`;
}
