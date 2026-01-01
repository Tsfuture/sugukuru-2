// Stripe Webhook Handler for Supabase Edge Functions
// 署名検証を行い、Stripeからのイベントを安全に処理する

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// Stripe SDKの初期化
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const stripe = new Stripe(stripeSecretKey as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

console.log("[stripe-webhook] Function initialized");

Deno.serve(async (req) => {
  console.log("[stripe-webhook] received request");
  console.log("[stripe-webhook] method:", req.method);

  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
      },
    });
  }

  // POSTメソッドのみ許可
  if (req.method !== "POST") {
    console.log("[stripe-webhook] Method not allowed:", req.method);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 1. rawBodyを取得（req.json()ではなくreq.text()を使用）
    const rawBody = await req.text();
    console.log("[stripe-webhook] rawBody length:", rawBody.length);

    // 2. stripe-signatureヘッダーを取得
    const sig = req.headers.get("stripe-signature");
    console.log("[stripe-webhook] signature present:", !!sig);

    if (!sig) {
      console.error("[stripe-webhook] error: Missing stripe-signature header");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!webhookSecret) {
      console.error("[stripe-webhook] error: STRIPE_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. 署名検証
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        sig,
        webhookSecret
      );
      console.log("[stripe-webhook] signature OK");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[stripe-webhook] error: Invalid signature -", errorMessage);
      return new Response(
        JSON.stringify({ error: "Invalid signature", details: errorMessage }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 4. イベント情報をログ出力
    console.log("[stripe-webhook] event:", event.type);
    console.log("[stripe-webhook] event id:", event.id);

    // 5. イベントタイプごとの処理
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("[stripe-webhook] PaymentIntent succeeded:", paymentIntent.id);
        console.log("[stripe-webhook] Amount:", paymentIntent.amount);
        console.log("[stripe-webhook] Metadata:", JSON.stringify(paymentIntent.metadata));
        // TODO: 購入履歴の更新など、実際のビジネスロジックをここに実装
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[stripe-webhook] Checkout session completed:", session.id);
        console.log("[stripe-webhook] Customer:", session.customer);
        console.log("[stripe-webhook] Metadata:", JSON.stringify(session.metadata));
        // TODO: セッション完了時の処理をここに実装
        break;
      }

      case "setup_intent.succeeded": {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        console.log("[stripe-webhook] SetupIntent succeeded:", setupIntent.id);
        console.log("[stripe-webhook] Customer:", setupIntent.customer);
        break;
      }

      default:
        console.log("[stripe-webhook] Unhandled event type:", event.type);
    }

    // 6. 成功レスポンスを返す
    console.log("[stripe-webhook] Processing completed successfully");
    return new Response(
      JSON.stringify({ received: true, type: event.type }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
