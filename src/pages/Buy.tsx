import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StepIndicator, CHECKOUT_STEPS } from "@/components/StepIndicator";
import { QuantitySelector } from "@/components/QuantitySelector";
import { PriceDisplay } from "@/components/PriceDisplay";
import { ConsentCheckbox, DEFAULT_CONSENT_ITEMS } from "@/components/ConsentCheckbox";
import { formatPrice } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, ArrowUp, Ticket, MapPin, Clock, AlertTriangle, Loader2, Home } from "lucide-react";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

type StoreRow = {
  id: string;
  name: string;
  description: string | null;
  fastpass_price: number;
  is_open: boolean;
};

// get-price API response type
interface GetPriceResponse {
  price_yen: number;
  breakdown: {
    base_price: number;
    util: number;
    slot_purchases: number;
    step_effect: number;
    wait_effect: number;
    env_effect: number;
    final_multiplier: number;
  };
  store: {
    id: string;
    name: string;
    description: string | null;
    is_open: boolean;
  };
  dynamic_enabled: boolean;
  slot_id: string;
}

export default function Buy() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  
  // URLから店舗IDを取得（store優先、互換でfacilityも読む）
  const storeId = searchParams.get("store") || searchParams.get("facility");
  
  // Supabaseからstore取得
  const [store, setStore] = useState<StoreRow | null>(null);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);
  
  // ダイナミック価格の状態
  const [dynamicPrice, setDynamicPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  useEffect(() => {
    async function fetchStore() {
      if (!storeId) {
        setLoadingStore(false);
        return;
      }
      setLoadingStore(true);
      setStoreError(null);

      const { data, error } = await supabase
        .from("stores")
        .select("id,name,description,fastpass_price,is_open")
        .eq("id", storeId)
        .single();

      if (error) {
        console.error("Store fetch error:", error);
        setStoreError("店舗情報の取得に失敗しました");
        setStore(null);
      } else {
        setStore(data as StoreRow);
      }
      setLoadingStore(false);
    }

    fetchStore();
  }, [storeId]);

  // get-price APIからダイナミック価格を取得
  useEffect(() => {
    async function fetchDynamicPrice() {
      if (!storeId || !store) return;
      
      setPriceLoading(true);
      try {
        const response = await supabase.functions.invoke<GetPriceResponse>("get-price", {
          body: { store_id: storeId },
        });

        if (response.error) {
          console.error("get-price error:", response.error);
          // フォールバック: store.fastpass_price を使用
          setDynamicPrice(null);
        } else if (response.data) {
          setDynamicPrice(response.data.price_yen);
        }
      } catch (err) {
        console.error("get-price fetch error:", err);
        setDynamicPrice(null);
      } finally {
        setPriceLoading(false);
      }
    }

    fetchDynamicPrice();
  }, [storeId, store]);

  // 価格: dynamicPrice があればそれを使用、なければ fastpass_price にフォールバック
  const unitPrice = dynamicPrice ?? store?.fastpass_price ?? 0;
  
  // ステップ管理
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [consents, setConsents] = useState(DEFAULT_CONSENT_ITEMS);
  
  // 「トップに戻る」ボタンの表示制御
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  
  const allConsented = consents.every((c) => c.checked);
  
  const handleConsentChange = (id: string, checked: boolean) => {
    setConsents((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked } : item))
    );
  };

  // Handle purchase flow
  const handlePurchase = () => {
    if (!storeId) return;

    // Check if user is logged in
    if (!user) {
      // Redirect to auth with return params
      const params = new URLSearchParams({
        store: storeId,
        quantity: String(quantity),
      });
      navigate(`/auth?${params.toString()}`);
      return;
    }

    // Check if user has payment method
    if (!profile?.has_payment_method) {
      const params = new URLSearchParams({
        store: storeId,
        quantity: String(quantity),
      });
      navigate(`/card-setup?${params.toString()}`);
      return;
    }

    // Proceed to temp ticket
    const params = new URLSearchParams({
      store: storeId,
      quantity: String(quantity),
      unitPrice: String(unitPrice),
    });
    navigate(`/temp-ticket?${params.toString()}`);
  };

  // ローディング表示
  if (loadingStore) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">{t('buy.loadingStore')}</p>
        </div>
      </div>
    );
  }

  // 店舗IDがない場合
  if (!storeId) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
            <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
          </div>
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-lg font-bold">{t('buy.noStoreSelected')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('buy.noStoreDesc')}
              </p>
              <Button asChild>
                <Link to="/">
                  <Home className="w-4 h-4 mr-2" />
                  {t('common.topPage')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 店舗が見つからない場合
  if (!store || storeError) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
            <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
          </div>
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
              <h2 className="text-lg font-bold">{t('buy.storeNotFound')}</h2>
              <p className="text-sm text-muted-foreground">
                {storeError || t('buy.storeNotFoundDesc')}
              </p>
              <Button asChild>
                <Link to="/">
                  <Home className="w-4 h-4 mr-2" />
                  {t('common.topPage')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <QuantitySelector
              quantity={quantity} 
              onChange={setQuantity} 
              maxQuantity={500}
              label={t('buy.selectQuantity')}
            />
            
            {/* 利用人数制限の注意書き */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4" />
              <span>{t('buy.quantityLimit')}</span>
            </div>

            <PriceDisplay unitPrice={unitPrice} quantity={quantity} />
          </div>
        );
      
      case 2:
        return (
          <div className="space-y-6">
            <ConsentCheckbox items={consents} onChange={handleConsentChange} />
            {!allConsented && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4" />
                <span>{t('buy.pleaseAgree')}</span>
              </div>
            )}
          </div>
        );
      
      case 3:
        return (
          <div className="space-y-6">
            <div className="bg-accent/30 rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-foreground">{t('buy.confirmOrder')}</h3>
              
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('buy.store')}:</span>
                <span className="font-medium text-foreground">{store.name}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('buy.purchaseDate')}:</span>
                <span className="font-medium text-foreground">
                  {new Date().toLocaleString()}
                </span>
              </div>
            </div>
            
            <PriceDisplay unitPrice={unitPrice} quantity={quantity} showPeakBadge={false} />
            
            <p className="text-xs text-muted-foreground text-center">
              {t('buy.ticketNote')}
            </p>
          </div>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="text-center space-y-2">
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
          <p className="text-sm text-muted-foreground">{t('buy.fastPassPurchase')}</p>
        </div>
        
        {/* 店舗情報カード */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">{store.name}</CardTitle>
            </div>
            <CardDescription>{store.description || t('stores.defaultDesc')}</CardDescription>
          </CardHeader>
        </Card>
        
        {/* メインカード */}
        <Card>
          <CardHeader>
            <StepIndicator steps={CHECKOUT_STEPS} currentStep={step} />
          </CardHeader>
          
          <CardContent className="space-y-6">
            {renderStep()}
            
            {/* ナビゲーションボタン */}
            <div className="flex gap-3">
              {step > 1 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('common.back')}
                </Button>
              )}
              
              {step < 3 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 2 && !allConsented}
                  className="flex-1"
                >
                  {t('common.next')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handlePurchase}
                  className="flex-1"
                  disabled={authLoading}
                >
                  <Ticket className="w-4 h-4 mr-2" />
                  {authLoading ? t('common.loading') : t('buy.secureTicket')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 注意事項 */}
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="pt-4 space-y-2">
            <p className="font-bold text-sm text-destructive">！注意点！</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>* こちら優先的に案内されるチケットです。お食事代とは別になります。</li>
              <li>* 1組6名様以上はご利用できません（1組6名様までSUGUKURUの利用ができます）</li>
              <li>※SUGUKURU利用時にお席の指定はできません（空き次第のご案内になります）</li>
              <li>※SUGUKURUチケットの事前購入はできません（必ず来店してからご購入ください。スタッフが日時の確認を行います）</li>
              <li>※購入後、直ぐに店舗スタッフへチケットをご提示ください</li>
            </ul>
          </CardContent>
        </Card>
        
        {/* トップページへ戻るボタン */}
        <div className="flex justify-center">
          <Button variant="outline" asChild className="w-full">
            <Link to="/" onClick={() => window.scrollTo(0, 0)}>
              <Home className="w-4 h-4 mr-2" />
              {t('common.topPage')}
            </Link>
          </Button>
        </div>
        
        {/* フッター */}
        <p className="text-xs text-center text-muted-foreground">
          ©︎ SUGUKURU ALL Rights Reserved.
        </p>
      </div>
      
      {/* トップに戻るボタン（固定位置・スクロール時のみ表示） */}
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToTop}
        aria-label={t('common.backToTop')}
        className={`
          fixed bottom-6 right-6 z-50
          w-10 h-10 rounded-full shadow-lg
          bg-background/95 backdrop-blur-sm
          border border-border
          transition-all duration-300 ease-in-out
          ${showBackToTop 
            ? 'opacity-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 translate-y-4 pointer-events-none'}
        `}
      >
        <ArrowUp className="w-5 h-5" />
      </Button>
    </div>
  );
}