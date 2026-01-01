import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ピーク時間帯の判定（18:00〜21:00 JST）
function isPeakTime(): boolean {
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  return jstHour >= 18 && jstHour < 21;
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
    if (!facilityId || !quantity || quantity < 1 || quantity > 6) {
      return new Response(
        JSON.stringify({ error: "Invalid parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ★ DBから店舗情報・価格を取得（ハードコード価格は使用しない）
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, name, fastpass_price, peak_extra_price, is_open")
      .eq("id", facilityId)
      .single();

    if (storeError || !store) {
      console.error("Store not found:", storeError);
      return new Response(
        JSON.stringify({ error: `施設が見つかりません: ${facilityId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!store.is_open) {
      return new Response(
        JSON.stringify({ error: "この施設は現在営業していません" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (store.fastpass_price === null || store.fastpass_price === undefined) {
      return new Response(
        JSON.stringify({ error: "施設の価格が設定されていません" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ★ サーバー側で価格計算（DBの値のみ使用）
    const basePrice = store.fastpass_price;
    const peak = isPeakTime();
    const dynamicFee = peak ? (store.peak_extra_price || 0) : 0;
    const unitPrice = basePrice + dynamicFee;
    const totalAmount = unitPrice * quantity;

    console.log(`[SECURITY] Price from DB: store=${store.name}, base=${basePrice}, dynamicFee=${dynamicFee}, unit=${unitPrice}, total=${totalAmount}`);

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
              name: `${store.name} - 優先案内チケット`,
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
        facilityName: store.name,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        dynamicFee: String(dynamicFee),
        totalAmount: String(totalAmount),
        basePrice: String(basePrice),
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
