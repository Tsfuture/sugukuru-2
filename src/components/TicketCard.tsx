import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface TicketInfoItem {
  icon: ReactNode;
  label: string;
  value: string | ReactNode;
}

interface TicketCardProps {
  /** チケットのタイトル（店舗名など） */
  title: string;
  /** バッジのテキスト（「購入済み」「仮チケット」など） */
  badge?: string;
  /** バッジのバリアント */
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  /** チケット情報の配列 */
  items: TicketInfoItem[];
  /** 追加のクラス名 */
  className?: string;
}

/**
 * チケット風UIコンポーネント
 * - 角丸カード + 点線のミシン目
 * - 左右に半円の切り欠き
 * - 控えめな影
 */
export function TicketCard({
  title,
  badge,
  badgeVariant = "default",
  items,
  className,
}: TicketCardProps) {
  return (
    <div className={cn("relative", className)}>
      {/* 左側の切り欠き */}
      <div 
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-background rounded-full z-10"
        aria-hidden="true"
      />
      {/* 右側の切り欠き */}
      <div 
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-6 h-6 bg-background rounded-full z-10"
        aria-hidden="true"
      />
      
      <Card className="border-2 border-primary/20 bg-card shadow-sm overflow-hidden">
        {/* ヘッダー部分 */}
        <CardHeader className="text-center border-b border-dashed border-primary/30 pb-4">
          <div className="space-y-2">
            {badge && (
              <Badge 
                variant={badgeVariant}
                className={cn(
                  badgeVariant === "default" && "bg-primary text-primary-foreground"
                )}
              >
                {badge}
              </Badge>
            )}
            <CardTitle className="text-xl">{title}</CardTitle>
          </div>
        </CardHeader>
        
        {/* コンテンツ部分 */}
        <CardContent className="pt-6 space-y-4">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="font-medium text-foreground truncate">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
