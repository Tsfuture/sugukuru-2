import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Lock, Zap, User } from "lucide-react";

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
function CardSetupForm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [cardholderName, setCardholderName] = useState("");
  const [saveCard, setSaveCard] = useState(false);

  const facilityId = searchParams.get("facility") || "";
  const quantity = searchParams.get("quantity") || "";

  const getRedirectUrl = () => {
    const params = new URLSearchParams();
    if (facilityId) params.set("facility", facilityId);
    if (quantity) params.set("quantity", quantity);
    return `/buy${params.toString() ? `?${params.toString()}` : ""}`;
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    // If user already has payment method, redirect to buy
    if (!loading && profile?.has_payment_method) {
      navigate(getRedirectUrl());
    }
  }, [profile, loading, navigate]);

  // Create SetupIntent when component mounts
  useEffect(() => {
    const createSetupIntent = async () => {
      if (!user || clientSecret) return;
      
      setLoadingIntent(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-setup-intent");
        
        if (error) {
          console.error("Failed to create SetupIntent:", error);
          toast({
            title: "エラー",
            description: "カード登録の準備に失敗しました",
            variant: "destructive",
          });
          return;
        }

        if (data?.clientSecret) {
          setClientSecret(data.clientSecret);
        }
      } catch (err) {
        console.error("SetupIntent error:", err);
      } finally {
        setLoadingIntent(false);
      }
    };

    createSetupIntent();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      toast({
        title: "エラー",
        description: "決済システムの読み込み中です。しばらくお待ちください。",
        variant: "destructive",
      });
      return;
    }

    if (!cardholderName.trim()) {
      toast({
        title: "入力エラー",
        description: "カード名義人を入力してください",
        variant: "destructive",
      });
      return;
    }

    if (!saveCard) {
      toast({
        title: "確認が必要です",
        description: "カード情報を登録するにはチェックを入れてください",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        throw new Error("Card element not found");
      }

      // Confirm the SetupIntent with the card details (card data stays with Stripe)
      const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            name: cardholderName.trim(),
          },
        },
      });

      if (stripeError) {
        console.error("Stripe error:", stripeError);
        toast({
          title: "カード登録エラー",
          description: stripeError.message || "カード情報の確認に失敗しました",
          variant: "destructive",
        });
        return;
      }

      if (setupIntent?.status === "succeeded" && setupIntent.payment_method) {
        // Now save the payment method to the customer's profile
        const { data, error } = await supabase.functions.invoke("setup-card", {
          body: {
            paymentMethodId: setupIntent.payment_method,
          },
        });

        if (error || !data?.success) {
          console.error("Card setup error:", error || data?.error);
          toast({
            title: "カード登録エラー",
            description: "カード情報の保存に失敗しました",
            variant: "destructive",
          });
          return;
        }

        await refreshProfile();
        toast({
          title: "カード登録完了",
          description: "カード情報を登録しました。チケット購入に進めます。",
        });
        navigate(getRedirectUrl());
      }
    } catch (err) {
      console.error("Card setup error:", err);
      toast({
        title: "エラー",
        description: "予期しないエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || loadingIntent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">読み込み中...</div>
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
          <h1 className="text-2xl font-bold text-foreground">クレジットカード登録</h1>
          <p className="text-sm text-muted-foreground">
            安全にカード情報を登録して、スムーズな決済を実現
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">お支払い情報</CardTitle>
            </div>
            <CardDescription>
              カード情報はStripeによって安全に管理されます
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

              {/* Save Card Checkbox */}
              <div className="flex items-center space-x-3 py-2">
                <Checkbox 
                  id="save-card" 
                  checked={saveCard}
                  onCheckedChange={(checked) => setSaveCard(checked === true)}
                />
                <Label 
                  htmlFor="save-card" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  このカード情報を登録する
                </Label>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/30 rounded-lg p-3">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <span>カード情報はStripeによって安全に暗号化・保管されます。当社サーバーには一切保存されません。</span>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={submitting || !stripe || !clientSecret || !saveCard}
              >
                {submitting ? "登録中..." : "このカードを登録する"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          登録完了後、チケット購入画面に戻ります
        </p>
      </div>
    </div>
  );
}

// Main component wrapped with Stripe Elements provider
export default function CardSetup() {
  return (
    <Elements stripe={stripePromise}>
      <CardSetupForm />
    </Elements>
  );
}
