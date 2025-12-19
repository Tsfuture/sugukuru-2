import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, ArrowRight, QrCode, TrendingUp, Loader2, Ticket, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

interface Store {
  id: string;
  name: string;
  description: string | null;
  fastpass_price: number;
  current_wait_time: number;
  is_open: boolean;
}

function isPeakTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 18 && hour < 21;
}

function formatPrice(price: number): string {
  return `¥${price.toLocaleString()}`;
}

export default function Index() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const peak = isPeakTime();

  useEffect(() => {
    async function fetchStores() {
      try {
        const { data, error } = await supabase
          .from("stores")
          .select("id, name, description, fastpass_price, current_wait_time, is_open")
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
              QRコードを読み取ってください
            </h1>
            <p className="text-sm text-muted-foreground">
              店舗に設置されたQRコードをスキャンすると、
              FastPass購入ページが開きます
            </p>
          </div>
          
          {peak && (
            <Badge variant="secondary" className="bg-accent text-accent-foreground">
              <TrendingUp className="w-3 h-3 mr-1" />
              現在ピーク時間帯（18:00〜21:00）
            </Badge>
          )}
        </div>
      </header>
      
      {/* 仕組み説明 */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-8">
            使い方は簡単
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <QrCode className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">1. QRコードを読み取る</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  店舗のQRコードをスマホで読み取ると、購入ページが開きます
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">2. FastPassを購入</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  クレジットカードで決済。アプリ不要、ブラウザで完結します
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">3. 優先案内を受ける</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  チケット画面をスタッフに見せて、待ち時間なしで案内されます
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
            導入店舗
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            下記のリンクから購入フローをお試しいただけます
          </p>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stores.map((store) => (
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
                              営業時間外
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {store.description || "FastPass対応店舗"}
                        </CardDescription>
                      </div>
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <Ticket className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>待ち時間: {store.current_wait_time}分</span>
                      </div>
                      <span className="font-bold text-primary">
                        {formatPrice(store.fastpass_price)}〜
                      </span>
                    </div>
                    <Button 
                      asChild 
                      className="w-full" 
                      size="sm"
                      disabled={!store.is_open}
                    >
                      <Link to={`/buy/${store.id}`}>
                        FastPassを購入
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
            © 2024 SUGUKURU - 行列スキップサービス
          </p>
          <p className="text-xs text-muted-foreground">
            アプリ不要・ブラウザで完結・QRコードで簡単購入
          </p>
          <div className="pt-2">
            <Link to="/tokusho" className="text-xs text-muted-foreground hover:text-foreground underline">
              特定商取引法に基づく表記
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
