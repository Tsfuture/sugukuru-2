import { formatPrice, isPeakTime } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp } from "lucide-react";

interface PriceDisplayProps {
  unitPrice: number;
  quantity: number;
  showPeakBadge?: boolean;
}

export function PriceDisplay({ unitPrice, quantity, showPeakBadge = true }: PriceDisplayProps) {
  const total = unitPrice * quantity;
  const peak = isPeakTime();

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
