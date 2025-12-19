// ダイナミックプライシングのロジック
// 将来的にはAPIやスプレッドシートから取得可能

export interface FacilityConfig {
  name: string;
  base: number;       // 基本料金（円）
  peakExtra: number;  // ピーク時の追加料金（円）
  description: string;
}

// 店舗ごとの価格テーブル
// ここを編集するだけで価格を変更できます
// 将来的にはSupabaseやGoogle Sheetsから読み込む
export const PRICING_TABLE: Record<string, FacilityConfig> = {
  default: {
    name: "デフォルト店舗",
    base: 1000,
    peakExtra: 0,
    description: "待ち時間を短縮して、スムーズにご案内",
  },
  "store-a": {
    name: "レストランA",
    base: 1200,
    peakExtra: 300,
    description: "人気レストランの優先案内チケット",
  },
  "store-b": {
    name: "クリニックB",
    base: 1500,
    peakExtra: 500,
    description: "診察の待ち時間を大幅短縮",
  },
  "theme-park": {
    name: "テーマパークC",
    base: 2000,
    peakExtra: 800,
    description: "アトラクションの優先搭乗権",
  },
};

// ピーク時間帯の判定（18:00〜21:00）
export function isPeakTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 18 && hour < 21;
}

// ダイナミックプライシング計算
export function calcDynamicPrice(facilityId: string): number {
  const config = PRICING_TABLE[facilityId] || PRICING_TABLE.default;
  let price = config.base;

  if (isPeakTime()) {
    price += config.peakExtra;
  }

  return price;
}

// 施設情報を取得
export function getFacilityInfo(facilityId: string): FacilityConfig {
  return PRICING_TABLE[facilityId] || PRICING_TABLE.default;
}

// 価格をフォーマット（¥1,200 形式）
export function formatPrice(price: number): string {
  return `¥${price.toLocaleString()}`;
}
