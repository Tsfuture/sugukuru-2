import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Mail, ArrowLeft } from "lucide-react";
import { z } from "zod";
import sugukuruLogo from "@/assets/sugukuru-logo.png";

const emailSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, profile, loading, signInWithOtp, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Preserve facility and quantity params for redirect after auth
  const facilityId = searchParams.get("facility") || "";
  const quantity = searchParams.get("quantity") || "";

  const buildRedirectParams = () => {
    const params = new URLSearchParams();
    if (facilityId) params.set("facility", facilityId);
    if (quantity) params.set("quantity", quantity);
    return params.toString() ? `?${params.toString()}` : "";
  };

  // Redirect logged-in users based on their payment method status
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.has_payment_method) {
        navigate(`/buy${buildRedirectParams()}`);
      } else {
        navigate(`/card-setup${buildRedirectParams()}`);
      }
    }
  }, [user, profile, loading, navigate, facilityId, quantity]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validatedData = emailSchema.parse({ email });

      const { error } = await signInWithOtp(validatedData.email);
      if (error) {
        toast({
          title: "送信エラー",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setEmailSent(true);
        toast({
          title: "認証メールを送信しました",
          description: "メールに記載されたリンクをクリックしてログインしてください",
        });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          title: "入力エラー",
          description: err.errors[0].message,
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast({
        title: "Googleログインエラー",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
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
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-10 mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">
            SUGUKURUアカウント
          </h1>
          <p className="text-sm text-muted-foreground">
            FastPassを購入するにはアカウントが必要です
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4 text-center">
            <h2 className="text-lg font-semibold">ログイン / 新規登録</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google Sign In */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              type="button"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Googleでログイン
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">または</span>
              </div>
            </div>

            {/* Magic Link Form */}
            {emailSent ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-foreground">メールを送信しました</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {email} に認証リンクを送信しました。
                  </p>
                  <p className="text-sm text-muted-foreground">
                    メールに記載されたリンクをクリックしてください。
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="text-sm"
                  onClick={() => {
                    setEmailSent(false);
                    setEmail("");
                  }}
                >
                  別のメールアドレスを使用する
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">メールアドレス</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    入力したアドレスに認証リンクが送信されます
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "送信中..." : "認証メールを送信"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Back to Top Link */}
        <div className="text-center">
          <Button variant="ghost" asChild className="text-muted-foreground">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t("common.topPage")}
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
