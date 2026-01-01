import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TicketCard } from "@/components/TicketCard";
import { Smartphone, MapPin, Users, Clock, CreditCard, ArrowLeft, Loader2 } from "lucide-react";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

// Store型定義
interface Store {
  id: string;
  name: string;
  fastpass_price: number;
  peak_extra_price: number;
  is_open: boolean;
}

export default function TempTicket() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // facility または store パラメータを受け付ける（Buy.tsx は store を使う）
  const facilityId = searchParams.get("facility") || searchParams.get("store") || "default";
  const quantity = parseInt(searchParams.get("quantity") || "1", 10);

  // ★ DBから価格を取得（URLパラメータの価格は無視）
  const [store, setStore] = useState<Store | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);

  // 表示用価格（DBから取得、決済後はサーバーレスポンスで更新）
  const [displayUnitPrice, setDisplayUnitPrice] = useState<number>(0);
  const [displayTotalPrice, setDisplayTotalPrice] = useState<number>(0);

  const [processing, setProcessing] = useState(false);  
  // ★ 冪等キー: 購入フロー開始時に1回だけ生成し、同一フロー中は再生成しない
  const [orderKey] = useState(() => crypto.randomUUID());
  // DBから店舗情報・価格を取得
  useEffect(() => {
    async function fetchStore() {
      setPriceLoading(true);
      setPriceError(null);

      const { data, error } = await supabase
        .from("stores")
        .select("id, name, fastpass_price, peak_extra_price, is_open")
        .eq("id", facilityId)
        .single();

      if (error || !data) {
        console.error("Store fetch error:", error);
        setPriceError("施設情報の取得に失敗しました");
        setPriceLoading(false);
        return;
      }

      if (!data.is_open) {
        setPriceError("この施設は現在営業していません");
        setPriceLoading(false);
        return;
      }

      if (data.fastpass_price === null || data.fastpass_price === undefined) {
        setPriceError("価格情報が設定されていません");
        setPriceLoading(false);
        return;
      }

      setStore(data);
      // ピーク時間帯の判定（18:00〜21:00 JST）- サーバーと同じロジック
      const now = new Date();
      const jstHour = (now.getUTCHours() + 9) % 24;
      const isPeak = jstHour >= 18 && jstHour < 21;
      const dynamicFee = isPeak ? (data.peak_extra_price || 0) : 0;
      const unitPrice = data.fastpass_price + dynamicFee;

      setDisplayUnitPrice(unitPrice);
      setDisplayTotalPrice(unitPrice * quantity);
      setPriceLoading(false);
    }

    fetchStore();
  }, [facilityId, quantity]);

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
        title: "カード未登録",
        description: "決済情報が見つかりません。カード登録を行ってください。",
        variant: "destructive",
      });
      navigate(`/card-setup?facility=${facilityId}&quantity=${quantity}`);
      return;
    }

    if (priceError || !store) {
      toast({
        title: "購入エラー",
        description: priceError || "施設情報の取得に失敗しました",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);

    try {
      // ★ サーバーには facilityId, quantity, orderKey を送信（金額は送らない）
      // orderKey は冪等キーとして使用され、同じリクエストの再送を安全に処理
      const { data, error } = await supabase.functions.invoke("process-payment", {
        body: {
          facilityId,
          quantity,
          orderKey,
          // userId は認証ヘッダーから取得されるため不要
        },
      });

      if (error) {
        console.error("Payment API error:", error);
        toast({
          title: "決済API エラー",
          description: "決済サーバーへの接続に失敗しました。ネットワークを確認してください。",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        // ★ サーバーから返された金額で表示を更新（ズレ防止）
        if (data.totalAmount !== undefined) {
          setDisplayTotalPrice(data.totalAmount);
        }
        if (data.unitPrice !== undefined) {
          setDisplayUnitPrice(data.unitPrice);
        }

        toast({
          title: "決済完了",
          description: `¥${data.totalAmount?.toLocaleString() || displayTotalPrice.toLocaleString()} のお支払いが完了しました`,
        });
        
        // ★ サーバーから返された金額をSuccessページに渡す
        const params = new URLSearchParams({
          facility: facilityId,
          quantity: String(data.quantity || quantity),
          total: String(data.totalAmount || displayTotalPrice),
          purchaseId: data.purchaseId || "",
          paymentIntentId: data.paymentIntentId || "",
        });
        navigate(`/success?${params.toString()}`);
      } else {
        // エラーコードに応じた具体的なメッセージ
        let errorTitle = "決済エラー";
        let errorDescription = data?.error || "決済に失敗しました";

        switch (data?.code) {
          case "INVALID_FACILITY_ID":
            errorTitle = "施設エラー";
            errorDescription = "指定された施設が見つかりません";
            break;
          case "INVALID_QUANTITY":
            errorTitle = "数量エラー";
            errorDescription = "購入枚数が不正です（1〜6枚）";
            break;
          case "STORE_ERROR":
            errorTitle = "施設エラー";
            break;
          case "STRIPE_ERROR":
            errorTitle = "決済処理エラー";
            errorDescription = "Stripeとの通信に失敗しました";
            break;
          case "CARD_DECLINED":
            errorTitle = "カード拒否";
            errorDescription = "カードが拒否されました。別のカードをお試しください。";
            break;
          case "DB_SAVE_ERROR":
            errorTitle = "システムエラー";
            errorDescription = "決済は完了しましたが、履歴の保存に失敗しました。お問い合わせください。";
            break;
        }

        toast({
          title: errorTitle,
          description: errorDescription,
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Payment error:", err);
      toast({
        title: "予期しないエラー",
        description: "通信エラーが発生しました。もう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleChangeQuantity = () => {
    navigate(`/buy?facility=${facilityId}`);
  };

  // ローディング中の表示
  if (priceLoading) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-4 pt-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">施設情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  // エラー表示
  if (priceError || !store) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
            <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
          </div>
          <Card className="border-2 border-destructive">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive font-medium">{priceError || "施設情報の取得に失敗しました"}</p>
              <Button
                variant="outline"
                onClick={() => navigate("/")}
                className="mt-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                トップに戻る
              </Button>
            </CardContent>
          </Card>
        </div>
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
        <TicketCard
          title={store.name}
          badge="仮チケット"
          badgeVariant="secondary"
          items={[
            {
              icon: <MapPin className="w-5 h-5 text-accent-foreground" />,
              label: "施設名",
              value: store.name,
            },
            {
              icon: <Users className="w-5 h-5 text-accent-foreground" />,
              label: "購入枚数",
              value: `${quantity}枚`,
            },
            {
              icon: <Clock className="w-5 h-5 text-accent-foreground" />,
              label: "購入日時",
              value: purchaseDate,
            },
            {
              icon: <CreditCard className="w-5 h-5 text-accent-foreground" />,
              label: "お支払い金額",
              value: <span className="text-lg">{formatPrice(displayTotalPrice)}</span>,
            },
          ]}
        />

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handlePurchase}
            disabled={processing || priceLoading}
            className="w-full"
            size="lg"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                決済処理中...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                チケットを購入する（{formatPrice(displayTotalPrice)}）
              </>
            )}
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
