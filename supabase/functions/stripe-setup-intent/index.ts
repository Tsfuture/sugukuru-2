// supabase/functions/stripe-setup-intent/index.ts
// SetupIntent を作成して clientSecret を返す

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // ✅ preflight を必ず 200系で返す
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("[stripe-setup-intent] Function invoked");

  try {
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      console.error("[stripe-setup-intent] Missing STRIPE_SECRET_KEY");
      return new Response(
        JSON.stringify({ error: "Missing STRIPE_SECRET_KEY", error_code: "CONFIG_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    // SetupIntent を作成
    // 注意: ここでは customer を紐づけていない（setup-card 側で attach するため）
    // 将来的に customer 紐づけが必要な場合は、Authorization から user を取得して customer を特定する
    const setupIntent = await stripe.setupIntents.create({
      usage: "off_session", // 後で off_session で課金する予定
    });

    console.log(`[stripe-setup-intent] Created SetupIntent: ${setupIntent.id}`);

    return new Response(
      JSON.stringify({ 
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stripe-setup-intent] Error:", message);
    return new Response(
      JSON.stringify({ error: message, error_code: "SETUP_INTENT_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});