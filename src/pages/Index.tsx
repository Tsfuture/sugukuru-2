import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Clock, Users, ArrowRight, QrCode, TrendingUp, Loader2, Ticket, User, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

interface Store {
  id: string;
  name: string;
  description: string | null;
  fastpass_price: number;
  is_open: boolean;
  category?: string; // カテゴリ（飲食/美容/クリニック等）
}

// カテゴリ定義（店舗検索用）
const STORE_CATEGORIES = [
  { id: "all", label: "すべて" },
  { id: "restaurant", label: "飲食" },
  { id: "beauty", label: "美容" },
  { id: "clinic", label: "クリニック" },
  { id: "other", label: "その他" },
] as const;

type CategoryId = typeof STORE_CATEGORIES[number]["id"];

// get-price API response type
interface GetPriceResponse {
  price_yen: number;
  breakdown: {
    base_price: number;
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

function isPeakTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 18 && hour < 21;
}

function formatPrice(price: number): string {
  return `¥${price.toLocaleString()}`;
}

export default function Index() {
  const { t } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const { user } = useAuth();
  const peak = isPeakTime();
  
  // 検索・フィルタリング用state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");
  
  // フィルタリングされた店舗一覧（useMemoで最適化）
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      // テキスト検索（店名・説明に部分一致）
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        store.name.toLowerCase().includes(query) ||
        (store.description?.toLowerCase().includes(query) ?? false);
      
      // カテゴリフィルタ（現在はcategoryフィールドがないため、descriptionから推測）
      // 将来的にはDBにcategoryカラムを追加することを推奨
      let matchesCategory = true;
      if (selectedCategory !== "all") {
        const desc = (store.description || "").toLowerCase();
        const name = store.name.toLowerCase();
        const combined = `${name} ${desc}`;
        
        switch (selectedCategory) {
          case "restaurant":
            matchesCategory = combined.includes("レストラン") || 
                             combined.includes("restaurant") ||
                             combined.includes("飲食") ||
                             combined.includes("カフェ") ||
                             combined.includes("居酒屋");
            break;
          case "beauty":
            matchesCategory = combined.includes("美容") || 
                             combined.includes("サロン") ||
                             combined.includes("beauty") ||
                             combined.includes("ヘア") ||
                             combined.includes("ネイル");
            break;
          case "clinic":
            matchesCategory = combined.includes("クリニック") || 
                             combined.includes("clinic") ||
                             combined.includes("病院") ||
                             combined.includes("医院") ||
                             combined.includes("歯科");
            break;
          case "other":
            // 上記いずれにも該当しない場合
            const isRestaurant = combined.includes("レストラン") || combined.includes("飲食") || combined.includes("カフェ");
            const isBeauty = combined.includes("美容") || combined.includes("サロン");
            const isClinic = combined.includes("クリニック") || combined.includes("病院");
            matchesCategory = !isRestaurant && !isBeauty && !isClinic;
            break;
        }
      }
      
      return matchesSearch && matchesCategory;
    });
  }, [stores, searchQuery, selectedCategory]);

  useEffect(() => {
    async function fetchStores() {
      try {
        const { data, error } = await supabase
          .from("stores")
          .select("id, name, description, fastpass_price, is_open")
          .order("name");

        if (error) {
          console.error("Stores fetch error:", error);
          return;
        }

        setStores(data || []);
      } catch (err) {
        console.error("Unexpected error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStores();
  }, []);

  // 各店舗のダイナミック価格を並列取得
  useEffect(() => {
    async function fetchDynamicPrices() {
      if (stores.length === 0) return;
      
      setPricesLoading(true);
      const prices: Record<string, number> = {};
      
      // 並列でget-price APIを呼び出し
      const pricePromises = stores.map(async (store) => {
        try {
          const response = await supabase.functions.invoke<GetPriceResponse>("get-price", {
            body: { store_id: store.id },
          });
          
          if (response.data && !response.error) {
            prices[store.id] = response.data.price_yen;
          }
        } catch (err) {
          console.error(`get-price error for ${store.id}:`, err);
          // フォールバック価格はprices辞書に入れない（後でfastpass_priceを使う）
        }
      });
      
      await Promise.all(pricePromises);
      setDynamicPrices(prices);
      setPricesLoading(false);
    }

    fetchDynamicPrices();
  }, [stores]);

  // 店舗の表示価格を取得（ダイナミック価格があればそれを、なければfastpass_priceを使用）
  const getDisplayPrice = (store: Store): number => {
    return dynamicPrices[store.id] ?? store.fastpass_price;
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* ヒーローセクション - QR Code Scan Message */}
      <header className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="w-10" />
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-10" />
          <Button variant="ghost" size="icon" asChild>
            <Link to={user ? "/mypage" : "/auth"}>
              <User className="w-5 h-5" />
            </Link>
          </Button>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-8 text-center space-y-6">
          
          {/* Main QR Scan Message */}
          <div className="bg-accent/50 rounded-xl p-6 max-w-md mx-auto">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              {t('header.scanQR')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('header.scanDescription')}
            </p>
          </div>
          
          {peak && (
            <Badge variant="secondary" className="bg-accent text-accent-foreground">
              <TrendingUp className="w-3 h-3 mr-1" />
              {t('header.peakTime')}
            </Badge>
          )}
        </div>
      </header>
      
      {/* 仕組み説明 */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-8">
            {t('howTo.title')}
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <QrCode className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{t('howTo.step1Title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  {t('howTo.step1Desc')}
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{t('howTo.step2Title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  {t('howTo.step2Desc')}
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{t('howTo.step3Title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  {t('howTo.step3Desc')}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* 導入店舗一覧 */}
      <section className="py-12 px-4 bg-card border-y border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-2">
            {t('stores.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-6">
            {t('stores.description')}
          </p>
          
          {/* 検索UI: 検索欄 + カテゴリボタン */}
          <div className="space-y-4 mb-8">
            {/* 検索入力欄 */}
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="店舗名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="検索クリア"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* カテゴリボタン（チップ/ピル型） */}
            <div className="flex flex-wrap justify-center gap-2">
              {STORE_CATEGORIES.map((cat) => (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="rounded-full"
                >
                  {cat.label}
                </Button>
              ))}
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredStores.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchQuery || selectedCategory !== "all" 
                  ? "該当する店舗が見つかりませんでした" 
                  : "店舗がありません"}
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStores.map((store) => (
                <Card 
                  key={store.id} 
                  className={`hover:border-primary/50 transition-colors ${!store.is_open ? 'opacity-60' : ''}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {store.name}
                          {!store.is_open && (
                            <Badge variant="secondary" className="text-xs">
                              {t('stores.closed')}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {store.description || t('stores.defaultDesc')}
                        </CardDescription>
                      </div>
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Ticket className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-start">
                      {/* 
                        価格表示: 正規価格が確定するまで「読み込み中...」を表示
                        誤った価格（¥500...等）を一瞬でも表示しないためのA案実装
                        - pricesLoading中はスケルトン的な「読み込み中...」を表示
                        - dynamicPrices[store.id]が確定したら正規価格を表示
                      */}
                      <span className="font-bold text-primary text-xl">
                        {pricesLoading && !dynamicPrices[store.id] 
                          ? t('common.loading')
                          : `${formatPrice(getDisplayPrice(store))}${t('stores.priceFrom')}`}
                      </span>
                    </div>
                    <Button 
                      asChild 
                      className="w-full" 
                      size="sm"
                      disabled={!store.is_open || (pricesLoading && !dynamicPrices[store.id])}
                    >
                      <Link to={`/buy?store=${store.id}`}>
                        {t('stores.buyFastPass')}
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
      
      {/* フッター */}
      <footer className="py-8 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-8 mx-auto opacity-50" />
          <p className="text-sm text-muted-foreground">
            ©︎ SUGUKURU All Rights Reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            {t('footer.tagline')}
          </p>
          <div className="pt-2 flex items-center justify-center gap-4">
            <Link to="/tokusho" className="text-xs text-muted-foreground hover:text-foreground underline">
              {t('footer.tokushoLink')}
            </Link>
            <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground underline">
              {t('footer.termsLink')}
            </Link>
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground underline">
              {t('footer.privacyLink')}
            </Link>
            <a href="https://mail.google.com/mail/?view=cm&fs=1&to=sugukuru.jp@gmail.com&su=%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B&body=%E6%9C%AC%E6%96%87%E3%82%92%E3%81%94%E8%A8%98%E5%85%A5%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground underline">
              {t('contact.title')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
