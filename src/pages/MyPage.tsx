import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { User, CreditCard, LogOut, ArrowLeft, Pencil } from "lucide-react";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

function getCardBrandDisplay(brand: string | null): string {
  if (!brand) return "カード";
  const brandMap: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    jcb: "JCB",
    diners: "Diners Club",
    discover: "Discover",
  };
  return brandMap[brand.toLowerCase()] || brand;
}

export default function MyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?redirect=/mypage");
    }
  }, [loading, user, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleChangeCard = () => {
    navigate("/mypage/card");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="bg-card border-b border-border">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-8" />
          <div className="w-10" />
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t('mypage.title')}</h1>

        {/* ユーザー情報 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{profile?.name || t('mypage.user')}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* カード情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              {t('mypage.registeredCard')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile?.has_payment_method && profile?.card_last4 ? (
              <>
                <div className="bg-accent/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('mypage.card')}</span>
                    <span className="font-medium text-foreground">
                      {getCardBrandDisplay(profile.card_brand)} •••• {profile.card_last4}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('mypage.expiry')}</span>
                    <span className="font-medium text-foreground">
                      {profile.card_exp_month?.toString().padStart(2, "0")}/{profile.card_exp_year}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleChangeCard}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('mypage.changeCard')}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('mypage.noCard')}
                </p>
                <Button className="w-full" onClick={handleChangeCard}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {t('mypage.registerCard')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ログアウト */}
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {t('mypage.signOut')}
        </Button>
      </main>

      {/* フッター */}
      <footer className="py-8 px-4">
        <div className="max-w-md mx-auto text-center">
          <Link to="/tokusho" className="text-xs text-muted-foreground hover:text-foreground underline">
            {t('footer.tokushoLink')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
