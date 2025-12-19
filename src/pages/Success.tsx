import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getFacilityInfo, formatPrice } from "@/lib/pricing";
import { CheckCircle, MapPin, Calendar, Users, CreditCard, ArrowRight, Loader2 } from "lucide-react";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

interface PurchaseData {
  id: string;
  facility_id: string;
  facility_name: string;
  quantity: number;
  unit_price: number;
  dynamic_fee: number;
  total_amount: number;
  currency: string;
  purchased_at: string;
  status: string;
}

export default function Success() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const purchaseId = searchParams.get("purchaseId");
  const facilityIdParam = searchParams.get("facility") || "default";
  const quantityParam = parseInt(searchParams.get("quantity") || "1", 10);
  const totalParam = parseInt(searchParams.get("total") || "0", 10);
  
  const [purchase, setPurchase] = useState<PurchaseData | null>(null);
  const [loading, setLoading] = useState(!!purchaseId);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch purchase data from DB if purchaseId is available
  useEffect(() => {
    async function fetchPurchase() {
      if (!purchaseId) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error: fetchError } = await supabase
          .from("purchase_history")
          .select("*")
          .eq("id", purchaseId)
          .maybeSingle();
        
        if (fetchError) {
          console.error("Error fetching purchase:", fetchError);
          setError("購入情報の取得に失敗しました");
        } else if (data) {
          setPurchase(data as PurchaseData);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError("購入情報の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    
    fetchPurchase();
  }, [purchaseId]);
  
  // Use purchase data from DB or fallback to URL params
  const facilityId = purchase?.facility_id || facilityIdParam;
  const facilityName = purchase?.facility_name || getFacilityInfo(facilityIdParam).name;
  const quantity = purchase?.quantity || quantityParam;
  const totalAmount = purchase?.total_amount || totalParam;
  
  // Format purchase date
  const purchasedAt = purchase?.purchased_at 
    ? new Date(purchase.purchased_at)
    : new Date();
  
  const formattedDate = purchasedAt.toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
        </div>

        {/* 成功メッセージ */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              FastPassのご購入ありがとうございました！
            </h1>
            <p className="text-muted-foreground mt-2">
              ご登録のメールアドレス宛に購入情報をお送りしました
            </p>
          </div>
        </div>
        
        {/* チケット情報カード */}
        <Card className="border-2 border-primary/20 bg-card">
          <CardHeader className="text-center border-b border-border pb-4">
            <div className="space-y-2">
              <Badge className="bg-primary text-primary-foreground">
                購入済み
              </Badge>
              <CardTitle className="text-xl">{facilityName}</CardTitle>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">施設名</p>
                <p className="font-medium text-foreground">{facilityName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">購入日時</p>
                <p className="font-medium text-foreground">{formattedDate}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">枚数</p>
                <p className="font-medium text-foreground">{quantity}枚</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">支払い金額</p>
                <p className="font-medium text-foreground text-lg">{formatPrice(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        
        {/* 注意事項 */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• 本チケットは当日限り有効です</p>
          <p>• 購入後のキャンセル・返金はできません</p>
          <p>• スクリーンショットでの提示も可能です</p>
        </div>
        
        {/* アクションボタン */}
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={() => navigate(`/buy?facility=${facilityId}`)}
          >
            FastPassをもう1枚購入する
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate("/")}
          >
            一覧へ戻る
          </Button>
        </div>
      </div>
    </div>
  );
}