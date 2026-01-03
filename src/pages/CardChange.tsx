import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { 
  Elements, 
  CardNumberElement, 
  CardExpiryElement, 
  CardCvcElement, 
  useStripe, 
  useElements 
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Zap, User, ArrowLeft, CheckCircle } from "lucide-react";

// Initialize Stripe with publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

// Stripe Element styling to match the app theme
const elementStyle = {
  base: {
    fontSize: "16px",
    color: "#1a1a1a",
    fontFamily: "system-ui, -apple-system, sans-serif",
    "::placeholder": {
      color: "#9ca3af",
    },
  },
  invalid: {
    color: "#ef4444",
    iconColor: "#ef4444",
  },
};

// Inner form component that uses Stripe hooks
function CardChangeForm() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [cardholderName, setCardholderName] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // 既に confirmCardSetup が成功した paymentMethodId を保持
  const [confirmedPaymentMethodId, setConfirmedPaymentMethodId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?redirect=/mypage/card");
    }
  }, [user, loading, navigate]);

  // Create SetupIntent function - 毎回新しいものを作成
  const createSetupIntent = async (): Promise<string | null> => {
    if (!user) return null;
    
    setLoadingIntent(true);
    setSetupError(null);
    // 前回のを無効化
    setClientSecret(null);
    setConfirmedPaymentMethodId(null);

    try {
      const { data, error } = await supabase.functions.invoke("stripe-setup-intent");
      
      if (error) {
        console.error("Failed to create SetupIntent:", error);
        setSetupError("カード登録の準備に失敗しました。再試行してください。");
        return null;
      }

      if (data?.clientSecret) {
        setClientSecret(data.clientSecret);
        return data.clientSecret;
      }
      return null;
    } catch (err) {
      console.error("SetupIntent error:", err);
      setSetupError("カード登録の準備に失敗しました。再試行してください。");
      return null;
    } finally {
      setLoadingIntent(false);
    }
  };

  // setup-card 呼び出しを分離して再試行可能に
  const callSetupCard = async (paymentMethodId: string): Promise<boolean> => {
    console.log("Calling setup-card with paymentMethodId:", paymentMethodId);
    
    const { data, error } = await supabase.functions.invoke("setup-card", {
      body: { paymentMethodId },
    });

    if (error) {
      console.error("setup-card invocation error:", error);
      const errorMsg = error.message || "カード情報の保存に失敗しました";
      setSetupError(errorMsg);
      return false;
    }

    if (!data?.success) {
      console.error("setup-card returned error:", data);
      const errorDetail = data?.message || data?.error_code || "カード情報の保存に失敗しました";
      const details = data?.details ? ` (${data.details})` : "";
      setSetupError(`${errorDetail}${details}`);
      return false;
    }

    console.log("setup-card succeeded:", data);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setSetupError("決済システムの読み込み中です。しばらくお待ちください。");
      return;
    }

    if (!cardholderName.trim()) {
      setSetupError("カード名義人を入力してください");
      return;
    }

    setSubmitting(true);
    setSetupError(null);

    try {
      // 既に confirmCardSetup が成功している場合は setup-card の再試行のみ
      if (confirmedPaymentMethodId) {
        console.log("Retrying setup-card with already confirmed paymentMethodId:", confirmedPaymentMethodId);
        const setupSuccess = await callSetupCard(confirmedPaymentMethodId);
        if (setupSuccess) {
          await refreshProfile();
          setSuccess(true);
          toast({
            title: "カード情報を更新しました",
            description: "新しいカードが登録されました。",
          });
        }
        return;
      }

      // 新しい SetupIntent を取得
      const secret = await createSetupIntent();
      if (!secret) {
        return;
      }

      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        throw new Error("Card element not found");
      }

      // Confirm the SetupIntent with the card details
      const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(secret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            name: cardholderName.trim(),
          },
        },
      });

      if (stripeError) {
        console.error("Stripe error:", stripeError);

        // setup_intent_unexpected_state の場合、既に succeeded かもしれない
        if (stripeError.code === "setup_intent_unexpected_state") {
          console.log("SetupIntent unexpected state, checking current status...");
          
          const { setupIntent: existingIntent } = await stripe.retrieveSetupIntent(secret);
          
          if (existingIntent?.status === "succeeded" && existingIntent.payment_method) {
            console.log("SetupIntent already succeeded, proceeding to setup-card");
            const pmId = typeof existingIntent.payment_method === "string"
              ? existingIntent.payment_method
              : existingIntent.payment_method.id;
            
            setConfirmedPaymentMethodId(pmId);
            const setupSuccess = await callSetupCard(pmId);
            if (setupSuccess) {
              await refreshProfile();
              setSuccess(true);
              toast({
                title: "カード情報を更新しました",
                description: "新しいカードが登録されました。",
              });
            }
            return;
          }
          
          setClientSecret(null);
          setSetupError("カード登録の状態が不正です。もう一度お試しください。");
          return;
        }

        setSetupError(stripeError.message || "カード情報の確認に失敗しました");
        setClientSecret(null);
        return;
      }

      if (setupIntent?.status === "succeeded" && setupIntent.payment_method) {
        const pmId = typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method.id;

        setConfirmedPaymentMethodId(pmId);

        const setupSuccess = await callSetupCard(pmId);
        if (setupSuccess) {
          await refreshProfile();
          setSuccess(true);
          toast({
            title: "カード情報を更新しました",
            description: "新しいカードが登録されました。",
          });
        }
      } else {
        setSetupError("カード登録が完了しませんでした。もう一度お試しください。");
        setClientSecret(null);
      }
    } catch (err) {
      console.error("Card setup error:", err);
      setSetupError("予期しないエラーが発生しました");
      setClientSecret(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">読み込み中...</div>
      </div>
    );
  }

  // 成功画面
  if (success) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
              <Zap className="w-4 h-4" />
              SUGUKURU
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold">カード情報を更新しました</h2>
              <p className="text-sm text-muted-foreground">
                新しいカード情報が保存されました。<br />
                次回のお支払いから新しいカードが使用されます。
              </p>
              <Button asChild className="w-full">
                <Link to="/mypage">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  マイページに戻る
                </Link>
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
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
            <Zap className="w-4 h-4" />
            SUGUKURU
          </div>
          <h1 className="text-2xl font-bold text-foreground">カード情報の変更</h1>
          <p className="text-sm text-muted-foreground">
            新しいカード情報を入力してください
          </p>
        </div>

        {/* 現在のカード情報 */}
        {profile?.has_payment_method && profile?.card_last4 && (
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">現在のカード</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {profile.card_brand || "カード"} •••• {profile.card_last4}
                </span>
                <span className="text-sm text-muted-foreground">
                  {profile.card_exp_month?.toString().padStart(2, "0")}/{profile.card_exp_year}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">新しいカード情報</CardTitle>
            </div>
            <CardDescription>
              以下に新しいカード情報を入力してください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Card Number */}
              <div className="space-y-2">
                <Label htmlFor="card-number">カード番号</Label>
                <div className="border rounded-md p-3 bg-background">
                  <CardNumberElement 
                    id="card-number"
                    options={{ 
                      style: elementStyle,
                      placeholder: "1234 5678 9012 3456"
                    }} 
                  />
                </div>
              </div>

              {/* Expiry and CVC Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="card-expiry">有効期限</Label>
                  <div className="border rounded-md p-3 bg-background">
                    <CardExpiryElement 
                      id="card-expiry"
                      options={{ 
                        style: elementStyle,
                        placeholder: "MM / YY"
                      }} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-cvc">セキュリティコード</Label>
                  <div className="border rounded-md p-3 bg-background">
                    <CardCvcElement 
                      id="card-cvc"
                      options={{ 
                        style: elementStyle,
                        placeholder: "123"
                      }} 
                    />
                  </div>
                </div>
              </div>

              {/* Cardholder Name */}
              <div className="space-y-2">
                <Label htmlFor="cardholder-name">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    カード名義人
                  </div>
                </Label>
                <Input
                  id="cardholder-name"
                  type="text"
                  placeholder="TARO YAMADA"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
                  className="uppercase"
                />
              </div>

              {/* Error display */}
              {setupError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {setupError}
                </div>
              )}

              <div className="py-2" />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={submitting || !stripe || loadingIntent}
              >
                {submitting || loadingIntent ? "変更中..." : "カード情報を変更する"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 戻るボタン */}
        <div className="text-center">
          <Button variant="ghost" asChild className="text-muted-foreground">
            <Link to="/mypage">
              <ArrowLeft className="w-4 h-4 mr-1" />
              マイページに戻る
            </Link>
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          ©︎ SUGUKURU ALL Rights Reserved.
        </p>
      </div>
    </div>
  );
}

// Main component wrapped with Stripe Elements provider
export default function CardChange() {
  return (
    <Elements stripe={stripePromise}>
      <CardChangeForm />
    </Elements>
  );
}
