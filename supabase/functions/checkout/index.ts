import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 価格テーブル（src/lib/pricing.ts と同期）
const PRICING_TABLE: Record<string, { name: string; base: number; peakExtra: number }> = {
  default: { name: "デフォルト店舗", base: 1000, peakExtra: 0 },
  "store-a": { name: "レストランA", base: 1200, peakExtra: 300 },
  "store-b": { name: "クリニックB", base: 1500, peakExtra: 500 },
  "theme-park": { name: "テーマパークC", base: 2000, peakExtra: 800 },
};

function isPeakTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 18 && hour < 21;
}

function calcDynamicPrice(facilityId: string): number {
  const config = PRICING_TABLE[facilityId] || PRICING_TABLE.default;
  let price = config.base;
  if (isPeakTime()) {
    price += config.peakExtra;
  }
  return price;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { facilityId, quantity } = await req.json();
    
    console.log(`Checkout request: facilityId=${facilityId}, quantity=${quantity}`);

    // バリデーション
    if (!facilityId || !quantity || quantity < 1) {
      return new Response(
        JSON.stringify({ error: "Invalid parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 価格計算
    const unitPrice = calcDynamicPrice(facilityId);
    const totalAmount = unitPrice * quantity;
    const facilityConfig = PRICING_TABLE[facilityId] || PRICING_TABLE.default;

    console.log(`Price calculated: unitPrice=${unitPrice}, total=${totalAmount}`);

    // Stripe初期化
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Stripe configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    // 成功・キャンセルURL
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const successUrl = `${origin}/success?facility=${facilityId}&quantity=${quantity}&total=${totalAmount}`;
    const cancelUrl = `${origin}/buy?facility=${facilityId}`;

    // Checkout Session作成
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: `${facilityConfig.name} - 優先案内チケット`,
              description: `${quantity}名様分の優先案内チケット`,
            },
            unit_amount: unitPrice,
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        facilityId,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        totalAmount: String(totalAmount),
      },
    });

    console.log(`Checkout session created: ${session.id}`);

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Checkout error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
