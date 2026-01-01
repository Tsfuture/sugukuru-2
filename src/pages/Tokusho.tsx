import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import sugukuruLogo from "@/assets/sugukuru-logo.png";
import { useEffect } from "react";

export default function Tokusho() {
  useEffect(() => {
    document.title = "特定商取引法に基づく表記｜SUGUKURU";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "特定商取引法に基づく表記｜SUGUKURU");
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
            特定商取引法に基づく表記
          </h1>

          <div className="space-y-6 text-foreground">
            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">組織名</h2>
              <p className="text-muted-foreground">SUGUKURU</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">責任者</h2>
              <p className="text-muted-foreground">代表取締役　古賀大翔</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">住所</h2>
              <p className="text-muted-foreground">東京都世田谷区4-2-12</p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">連絡先</h2>
              <p className="text-muted-foreground">
                メールアドレス：sugukuru.jp@gmail.com<br />
                *電話連絡をご希望の場合はメールにてその旨ご連絡いただければ遅滞なく開示致します。
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">利用料金</h2>
              <p className="text-muted-foreground">
                本サービスを利用する毎にSUGUKURUアプリ内に表記された利用料金が発生します（利用日時、利用店舗により利用料金は異なります。）
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">利用料金以外にお客様に発生する料金等</h2>
              <p className="text-muted-foreground">
                利用料金支払時に、消費税が発生します。また、インターネット接続料金その他の電気通信回線の通信に関する費用はお客様にて別途ご用意頂く必要があります（金額は、お客が契約した各事業者が定める通り）
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">支払い方法</h2>
              <ul className="text-muted-foreground list-disc list-inside space-y-1">
                <li>クレジットカード決済（VISA、JCB、Master、Amex）</li>
                <li>現金決済</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">支払い時期</h2>
              <div className="text-muted-foreground space-y-2">
                <p>
                  <strong>【クレジット決済】</strong><br />
                  ご利用のクレジットカードの締め日や契約内容によって異なります。<br />
                  ご利用されるカード会社までお問い合わせください。
                </p>
                <p>
                  <strong>【現金決済】</strong><br />
                  本サービス提供時に当社従業員又は当社指定の第三者に対してお支払い頂きます。
                </p>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">サービスの提供開始時期</h2>
              <p className="text-muted-foreground">
                当社所定の支払手続き終了後、すぐにご利用頂けます。
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">返品・交換について</h2>
              <p className="text-muted-foreground">
                SUGUKURU本チケット発行後のキャンセル・返金は認められません。但し、本チケットの購入後、本サービスの提供前に対象店舗内の行列が解消しており、本チケット購入の異議が喪失したような場合（本チケット未購入者と同タイミングでの着席となったような場合）にのみ例外的にキャンセル・返金に応じます。
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold border-b border-border pb-2">特別条件</h2>
              <div className="text-muted-foreground space-y-2">
                <p>
                  <strong>クーリングオフについて</strong><br />
                  特定商取引法に規定されるクーリング・オフが適用されるサービスではありません。
                </p>
                <p>
                  <strong>お問い合わせ</strong><br />
                  当社へのお問い合わせは、営業時間・問い合わせ内容に応じて、メールより行っていただけます。
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <img src={sugukuruLogo} alt="SUGUKURU" className="h-8 mx-auto opacity-50" />
          <p className="text-sm text-muted-foreground">
            ©︎ SUGUKURU ALL Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
