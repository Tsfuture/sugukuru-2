import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import sugukuruLogo from "@/assets/sugukuru-logo.png";
import { useEffect } from "react";
import { privacyText } from "@/legal/privacy";

export default function Privacy() {
  useEffect(() => {
    document.title = "SUGUKURUプライバシーポリシー｜SUGUKURU";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "SUGUKURUプライバシーポリシー｜SUGUKURU");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link to="/">
              <img src={sugukuruLogo} alt="SUGUKURU" className="h-10" />
            </Link>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                トップへ戻る
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <h1 className="text-2xl font-bold text-foreground text-center">
            SUGUKURUプライバシーポリシー
          </h1>

          <div className="text-foreground">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {privacyText}
            </pre>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground underline">
            トップへ戻る
          </Link>
        </div>
      </footer>
    </div>
  );
}
