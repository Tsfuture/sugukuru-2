import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFacilityInfo, formatPrice } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Smartphone, MapPin, Users, Clock, CreditCard, ArrowLeft } from "lucide-react";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

export default function TempTicket() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const facilityId = searchParams.get("facility") || "default";
  const quantity = parseInt(searchParams.get("quantity") || "1", 10);
  const unitPrice = parseInt(searchParams.get("unitPrice") || "0", 10);
  const totalPrice = unitPrice * quantity;

  const facility = getFacilityInfo(facilityId);
  const [processing, setProcessing] = useState(false);

  const purchaseDate = new Date().toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handlePurchase = async () => {
    if (!user || !profile?.has_payment_method) {
      toast({
        title: "エラー",
        description: "決済情報が見つかりません。カード登録を行ってください。",
        variant: "destructive",
      });
      navigate(`/card-setup?facility=${facilityId}&quantity=${quantity}`);
      return;
    }

    setProcessing(true);

    try {
      // Note: Server calculates price - don't send unitPrice (security)
      const { data, error } = await supabase.functions.invoke("process-payment", {
        body: {
          facilityId,
          quantity,
        },
      });
      if (error) {
        console.error("Payment error:", error);
        toast({
          title: "決済エラー",
          description: "決済処理に失敗しました。もう一度お試しください。",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        toast({
          title: "決済完了",
          description: "購入が完了しました",
        });
        
        const params = new URLSearchParams({
          facility: facilityId,
          quantity: String(quantity),
          total: String(totalPrice),
          purchaseId: data.purchaseId || "",
        });
        navigate(`/success?${params.toString()}`);
      } else {
        toast({
          title: "決済エラー",
          description: data?.error || "決済に失敗しました",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Payment error:", err);
      toast({
        title: "エラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleChangeQuantity = () => {
    navigate(`/buy?facility=${facilityId}`);
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
        </div>

        {/* Staff instruction */}
        <Card className="border-2 border-primary bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-primary" />
              <div>
                <p className="text-lg font-bold text-foreground">
                  こちらの画面をスタッフにお見せください
                </p>
                <p className="text-sm text-muted-foreground">
                  スタッフ確認後、指定の待機場所へご案内します
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Temp Ticket Card */}
        <Card className="border-2 border-border">
          <CardHeader className="text-center border-b border-border pb-4">
            <Badge variant="secondary" className="w-fit mx-auto mb-2">
              仮チケット
            </Badge>
            <CardTitle className="text-xl">{facility.name}</CardTitle>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">施設名</p>
                <p className="font-medium text-foreground">{facility.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">購入枚数</p>
                <p className="font-medium text-foreground">{quantity}枚</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">購入日時</p>
                <p className="font-medium text-foreground">{purchaseDate}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">お支払い金額</p>
                <p className="font-medium text-foreground text-lg">{formatPrice(totalPrice)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handlePurchase}
            disabled={processing}
            className="w-full"
            size="lg"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            {processing ? "決済処理中..." : `チケットを購入する（${formatPrice(totalPrice)}）`}
          </Button>

          <Button
            variant="outline"
            onClick={handleChangeQuantity}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            人数の変更がある場合のみ、再選択してください
          </Button>
        </div>

        {/* Note */}
        <p className="text-xs text-center text-muted-foreground">
          SUGUKURUご利用人数は1組6名様までです
        </p>
      </div>
    </div>
  );
}
