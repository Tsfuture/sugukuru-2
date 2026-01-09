import { formatPrice, isPeakTime } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PriceDisplayProps {
  unitPrice: number;
  quantity: number;
  showPeakBadge?: boolean;
  /** 価格読み込み中かどうか。trueの場合はスケルトン表示 */
  isLoading?: boolean;
}

/**
 * 価格表示コンポーネント
 * - isLoading=true: 「読み込み中...」を表示（誤った価格を一瞬でも出さない）
 * - isLoading=false: 正規価格を表示
 */
export function PriceDisplay({ unitPrice, quantity, showPeakBadge = true, isLoading = false }: PriceDisplayProps) {
  const { t } = useTranslation();
  const total = unitPrice * quantity;
  const peak = isPeakTime();

  // 価格読み込み中は「読み込み中...」を表示
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">単価</span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xl font-bold">{t('common.loading')}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">人数</span>
          <span className="text-lg font-medium text-foreground">{quantity}名</span>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-medium text-foreground">合計金額</span>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-2xl font-bold">{t('common.loading')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">単価</span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-foreground">{formatPrice(unitPrice)}</span>
          {showPeakBadge && peak && (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              <TrendingUp className="w-3 h-3 mr-1" />
              ピーク
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">人数</span>
        <span className="text-lg font-medium text-foreground">{quantity}名</span>
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium text-foreground">合計金額</span>
          <span className="text-2xl font-bold text-primary">{formatPrice(total)}</span>
        </div>
      </div>

      {peak && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent/50 rounded-lg p-3">
          <Clock className="w-4 h-4 text-accent-foreground" />
          <span>現在ピーク時間帯（18:00〜21:00）のため、追加料金が適用されています</span>
        </div>
      )}
    </div>
  );
}
