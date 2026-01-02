import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Store type from DB (with dynamic pricing columns)
interface Store {
  id: string;
  name: string;
  fastpass_price: number;
  peak_extra_price: number;
  is_open: boolean;
  current_wait_time: number;
  dynamic_enabled: boolean;
  avg_spend_yen: number;
  turnover_per_hour: number;
  target_fastpass_per_hour: number;
  min_price: number;
  max_price: number;
  k_util: number;
  k_step: number;
  k_wait: number;
  k_env: number;
}

// Round to nearest 10 yen
function roundTo10Yen(price: number): number {
  return Math.round(price / 10) * 10;
}

// Clamp value between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ★ get-price と同じダイナミックプライシングロジック
async function calcDynamicPrice(
  supabase: SupabaseClient,
  storeData: Store
): Promise<{ unitPrice: number; dynamicFee: number }> {
  if (!storeData.dynamic_enabled) {
    // ダイナミックプライシング無効時: 従来のピーク時間帯計算
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    const isPeak = jstHour >= 18 && jstHour < 21;
    const dynamicFee = isPeak ? (storeData.peak_extra_price || 0) : 0;
    const unitPrice = storeData.fastpass_price + dynamicFee;
    return { unitPrice, dynamicFee };
  }

  // ダイナミックプライシング有効時
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const slotStartSeconds = Math.floor(Date.now() / 1000 / 600) * 600;
  const slotStart = new Date(slotStartSeconds * 1000);

  // Count purchases in the last hour for utilization
  const { count: hourlyPurchases } = await supabase
    .from("purchase_history")
    .select("*", { count: "exact", head: true })
    .eq("facility_id", storeData.id)
    .eq("status", "completed")
    .gte("created_at", oneHourAgo.toISOString());

  // Count purchases in current 10-minute slot
  const { count: slotPurchases } = await supabase
    .from("purchase_history")
    .select("*", { count: "exact", head: true })
    .eq("facility_id", storeData.id)
    .eq("status", "completed")
    .gte("created_at", slotStart.toISOString());

  const effectiveHourlyPurchases = hourlyPurchases ?? 0;
  const effectiveSlotPurchases = slotPurchases ?? 0;
  const util = storeData.target_fastpass_per_hour > 0
    ? effectiveHourlyPurchases / storeData.target_fastpass_per_hour
    : 0;

  const envScore = Math.min(storeData.current_wait_time / 30, 2.0);
  const rawBase = Math.round(storeData.avg_spend_yen * 0.6);
  const basePrice = clamp(rawBase, storeData.min_price, storeData.max_price);

  const utilEffect = storeData.k_util * util;
  const stepEffect = storeData.k_step * effectiveSlotPurchases;
  const waitEffect = storeData.k_wait * storeData.current_wait_time;
  const envEffect = storeData.k_env * envScore;

  const multiplier = 1 + utilEffect + stepEffect + waitEffect + envEffect;
  const rawPrice = basePrice * multiplier;
  const clampedPrice = clamp(rawPrice, storeData.min_price, storeData.max_price);
  const finalPrice = roundTo10Yen(clampedPrice);
  const dynamicFee = finalPrice - storeData.fastpass_price;

  return { unitPrice: finalPrice, dynamicFee };
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

    // ★ DBから店舗情報・価格を取得（ダイナミックプライシング対応）
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select(`
        id, name, fastpass_price, peak_extra_price, is_open,
        current_wait_time, dynamic_enabled, avg_spend_yen, turnover_per_hour,
        target_fastpass_per_hour, min_price, max_price, k_util, k_step, k_wait, k_env
      `)
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

    // ★ get-price と同じダイナミックプライシングで価格計算
    const storeData = store as Store;
    const { unitPrice, dynamicFee } = await calcDynamicPrice(supabase, storeData);
    const totalAmount = unitPrice * quantity;

    console.log(`[SECURITY] Price from DB: store=${store.name}, base=${store.fastpass_price}, dynamicFee=${dynamicFee}, unit=${unitPrice}, total=${totalAmount}, dynamic_enabled=${store.dynamic_enabled}`);

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
