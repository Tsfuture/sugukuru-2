import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ピーク時間帯の判定（18:00〜21:00 JST）
function isPeakTime(): boolean {
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  return jstHour >= 18 && jstHour < 21;
}

// Store型定義
interface Store {
  id: string;
  name: string;
  fastpass_price: number;
  peak_extra_price: number;
  is_open: boolean;
}

// DBから店舗情報を取得し、サーバー側で価格計算
async function getStoreAndCalcPrice(
  supabase: SupabaseClient,
  facilityId: string
): Promise<{ store: Store; unitPrice: number; dynamicFee: number } | { error: string; status: number }> {
  const { data: store, error } = await supabase
    .from("stores")
    .select("id, name, fastpass_price, peak_extra_price, is_open")
    .eq("id", facilityId)
    .single();

  if (error || !store) {
    console.error("Store fetch error:", error);
    return { error: `施設が見つかりません: ${facilityId}`, status: 404 };
  }

  if (!store.is_open) {
    return { error: "この施設は現在営業していません", status: 400 };
  }

  if (store.fastpass_price === null || store.fastpass_price === undefined) {
    console.error("Store has no fastpass_price:", facilityId);
    return { error: "施設の価格が設定されていません", status: 500 };
  }

  // サーバー側でダイナミックプライシング計算（DBの値のみ使用）
  const basePrice = store.fastpass_price;
  const dynamicFee = isPeakTime() ? (store.peak_extra_price || 0) : 0;
  const unitPrice = basePrice + dynamicFee;

  return { store, unitPrice, dynamicFee };
}

// 購入確認メールを送信 (Resend REST API via fetch)
async function sendConfirmationEmail(
  email: string,
  facilityName: string,
  quantity: number,
  totalAmount: number,
  purchasedAt: string
): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  
  if (!resendApiKey) {
    console.log("RESEND_API_KEY not configured, skipping email");
    return;
  }
  
  try {
    const formattedDate = new Date(purchasedAt).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    });
    
    const formattedPrice = `¥${totalAmount.toLocaleString()}`;
    
    const emailBody = `
SUGUKURU FastPass 購入内容のご案内

いつもSUGUKURUをご利用いただきありがとうございます。
以下の内容でFastPassをご購入いただきました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 購入内容
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

施設名: ${facilityName}
購入日時: ${formattedDate}
枚数: ${quantity}枚
合計金額: ${formattedPrice}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ ご利用方法
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

購入完了画面または仮チケット画面を、
店舗スタッフにお見せください。

※ スクリーンショットでのご提示も可能です
※ 本チケットは当日限り有効です
※ 購入後のキャンセル・返金はできません

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。

SUGUKURUサポートチーム
    `.trim();
    
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "SUGUKURU <onboarding@resend.dev>",
        to: [email],
        subject: "[SUGUKURU] FastPass 購入内容のご案内",
        text: emailBody,
      }),
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Email send error:", response.status, errorBody);
    } else {
      console.log("Confirmation email sent to:", email);
    }
  } catch (error) {
    console.error("Email send exception:", error);
    // Don't throw - email failure shouldn't block the transaction
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error("User auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { facilityId, quantity, orderKey } = await req.json();

    console.log(`Processing payment for user: ${user.id}, facility: ${facilityId}, quantity: ${quantity}, orderKey: ${orderKey}`);

    // Validate input - orderKey is required for idempotency
    if (!orderKey || typeof orderKey !== "string") {
      return new Response(
        JSON.stringify({ error: "orderKey is required for idempotency", code: "MISSING_ORDER_KEY" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input - facilityId and quantity are required
    if (!facilityId || typeof facilityId !== "string") {
      return new Response(
        JSON.stringify({ error: "facilityId is required", code: "INVALID_FACILITY_ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 6) {
      return new Response(
        JSON.stringify({ error: "quantity must be an integer between 1 and 6", code: "INVALID_QUANTITY" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ★ DBからストア情報を取得し、価格をサーバー側で計算（フロントの値は無視）
    const storeResult = await getStoreAndCalcPrice(supabase, facilityId);
    if ("error" in storeResult) {
      return new Response(
        JSON.stringify({ error: storeResult.error, code: "STORE_ERROR" }),
        { status: storeResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { store, unitPrice, dynamicFee } = storeResult;
    const base = store.fastpass_price;
    const extra = dynamicFee;
    const total = unitPrice * qty;
    const totalAmount = total;

    // ★ 価格計算ログ（指定フォーマット）- DBの値のみを使用していることを確認
    console.info('Price calculation', { base, extra, unitPrice, quantity: qty, total });
    console.log(`[SECURITY] Price from DB - store: ${store.name}, basePrice: ${base}, dynamicFee: ${extra}, unitPrice: ${unitPrice}, quantity: ${qty}, totalAmount: ${totalAmount}`);

    // Initialize Stripe (fetch-based)
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Stripe configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeAuthHeader = `Basic ${btoa(stripeSecretKey + ":")}`;

    // Get user profile with Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id, has_payment_method, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id || !profile?.has_payment_method) {
      console.error("Profile error:", profileError);
      return new Response(
        JSON.stringify({ error: "Payment method not set up" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get customer's default payment method via Stripe REST API
    const customerResponse = await fetch(
      `https://api.stripe.com/v1/customers/${profile.stripe_customer_id}`,
      {
        method: "GET",
        headers: {
          "Authorization": stripeAuthHeader,
        },
      }
    );
    
    if (!customerResponse.ok) {
      const errorBody = await customerResponse.text();
      console.error("Stripe customer fetch error:", customerResponse.status, errorBody);
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const customer = await customerResponse.json();
    
    if (customer.deleted) {
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
    
    if (!defaultPaymentMethod) {
      return new Response(
        JSON.stringify({ error: "No default payment method" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating PaymentIntent for ${totalAmount} JPY`);

    // Create and confirm PaymentIntent with idempotencyKey for replay protection (Stripe REST API)
    interface StripePaymentIntent {
      id: string;
      status: string;
      error?: { message: string };
    }
    let paymentIntent: StripePaymentIntent;
    try {
      console.log(`Creating PaymentIntent with idempotencyKey: ${orderKey}`);
      
      // Build form-urlencoded body
      const params = new URLSearchParams();
      params.append("amount", String(totalAmount));
      params.append("currency", "jpy");
      params.append("customer", profile.stripe_customer_id);
      params.append("payment_method", defaultPaymentMethod);
      params.append("off_session", "true");
      params.append("confirm", "true");
      params.append("description", `${store.name} - SUGUKURU FastPass x${qty}`);
      params.append("metadata[facilityId]", facilityId);
      params.append("metadata[facilityName]", store.name);
      params.append("metadata[quantity]", String(qty));
      params.append("metadata[unitPrice]", String(unitPrice));
      params.append("metadata[dynamicFee]", String(dynamicFee));
      params.append("metadata[totalAmount]", String(totalAmount));
      params.append("metadata[userId]", user.id);
      params.append("metadata[basePrice]", String(store.fastpass_price));
      params.append("metadata[orderKey]", orderKey);
      
      const piResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          "Authorization": stripeAuthHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": orderKey,
        },
        body: params.toString(),
      });
      
      const piBody = await piResponse.json();
      
      if (!piResponse.ok) {
        console.error("Stripe PaymentIntent creation failed:", piBody);
        const message = piBody.error?.message || "Stripe error";
        return new Response(
          JSON.stringify({ error: `Stripe決済エラー: ${message}`, code: "STRIPE_ERROR" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      paymentIntent = piBody;
    } catch (stripeError: unknown) {
      console.error("Stripe PaymentIntent creation failed:", stripeError);
      const message = stripeError instanceof Error ? stripeError.message : "Stripe error";
      return new Response(
        JSON.stringify({ error: `Stripe決済エラー: ${message}`, code: "STRIPE_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`PaymentIntent created: ${paymentIntent.id}, status: ${paymentIntent.status}`);

    if (paymentIntent.status !== "succeeded") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Payment failed", 
          code: "PAYMENT_FAILED",
          paymentStatus: paymentIntent.status,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ★ PaymentIntentが succeeded → ここから先は必ず HTTP 200 を返す
    // DB保存が失敗してもthrowせず、warningを付けるだけ

    // Save purchase history with all required fields（Stripeに送った金額と完全一致）
    // テーブル定義: user_id, facility_id, quantity, unit_price, dynamic_fee, total_amount, stripe_payment_intent_id
    let purchaseId: string | null = null;
    let warning: string | undefined = undefined;

    // 冪等化: まず order_key または stripe_payment_intent_id で既存レコードを検索
    // order_key で先に検索（より早い段階で重複検出）
    let existingPurchase = null;
    let findError = null;
    
    // まず order_key で検索
    const { data: existingByOrderKey, error: orderKeyFindError } = await supabase
      .from("purchase_history")
      .select("id, stripe_payment_intent_id")
      .eq("order_key", orderKey)
      .maybeSingle();
    
    if (orderKeyFindError) {
      const { code, message, details, hint } = orderKeyFindError;
      console.error("purchase_history find by order_key error", { code, message, details, hint });
      findError = orderKeyFindError;
    } else if (existingByOrderKey) {
      existingPurchase = existingByOrderKey;
      console.log("purchase_history found by order_key (idempotent)", { purchaseId: existingByOrderKey.id, orderKey });
    } else {
      // order_key で見つからなければ stripe_payment_intent_id で検索
      const { data: existingByPi, error: piFindError } = await supabase
        .from("purchase_history")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();
      
      if (piFindError) {
        const { code, message, details, hint } = piFindError;
        console.error("purchase_history find by stripe_pi error", { code, message, details, hint });
        findError = piFindError;
      } else if (existingByPi) {
        existingPurchase = existingByPi;
        console.log("purchase_history found by stripe_payment_intent_id (idempotent)", { purchaseId: existingByPi.id });
      }
    }

    if (findError) {
      const { code, message, details, hint } = findError;
      console.error("purchase_history find error", { code, message, details, hint, raw: findError });
    }

    if (existingPurchase) {
      // 既存レコードがあれば、二重送信として成功扱い
      purchaseId = existingPurchase.id;
      console.log("purchase_history already exists (idempotent)", { purchaseId, paymentIntentId: paymentIntent.id });
    } else {
      // insert payload - テーブル定義に厳密一致 + order_key for idempotency
      const insertPayload = {
        user_id: user.id,
        facility_id: facilityId,
        facility_name: store.name,  // NOT NULL column in schema
        quantity: qty,
        unit_price: unitPrice,
        dynamic_fee: dynamicFee,
        total_amount: totalAmount,
        stripe_payment_intent_id: paymentIntent.id,
        order_key: orderKey,
        status: "succeeded",
      };

      console.log("purchase_history insert payload:", JSON.stringify(insertPayload));

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchase_history")
        .insert(insertPayload)
        .select("id")
        .single();

      if (purchaseError) {
        // PostgRESTエラーの詳細を必ずログ出力
        const { code, message, details, hint } = purchaseError;
        console.error("purchase_history insert error", {
          code,
          message,
          details,
          hint,
          raw: purchaseError,
        });
        
        // 重複エラー (unique constraint) の場合は冪等として成功扱い
        if (code === "23505") {
          console.log("purchase_history duplicate key (idempotent) - concurrent insert detected", { orderKey, paymentIntentId: paymentIntent.id });
          // 再度検索して ID を取得（order_key または stripe_payment_intent_id）
          const { data: retryPurchase } = await supabase
            .from("purchase_history")
            .select("id")
            .or(`order_key.eq.${orderKey},stripe_payment_intent_id.eq.${paymentIntent.id}`)
            .maybeSingle();
          purchaseId = retryPurchase?.id ?? null;
          console.log("purchase_history duplicate resolved", { purchaseId });
        } else {
          warning = "DB_SAVE_FAILED";
          purchaseId = null;
        }
      } else if (purchase) {
        purchaseId = purchase.id;
        console.log("purchase_history saved", { purchaseId, paymentIntentId: paymentIntent.id });
      } else {
        console.warn("purchase_history insert returned no data");
        purchaseId = null;
      }
    }

    console.log(`Payment successful for user: ${user.id}, purchase: ${purchaseId}, amount: ${totalAmount} JPY`);

    // Send confirmation email (non-blocking)
    const userEmail = user.email || profile.email;
    const purchasedAt = new Date().toISOString();
    if (userEmail) {
      try {
        await sendConfirmationEmail(
          userEmail,
          store.name,
          qty,
          totalAmount,
          purchasedAt
        );
      } catch (emailError) {
        console.error("Email send failed:", emailError);
        // Don't fail the transaction for email errors
      }
    }

    // ★ 決済成功時は常に HTTP 200 を返す（DB保存失敗でも）
    const responseBody: Record<string, unknown> = { 
      success: true, 
      paymentIntentId: paymentIntent.id,
      totalAmount: totalAmount,
      unitPrice: unitPrice,
      quantity: qty,
      facilityId: facilityId,
      facilityName: store.name,
      purchaseId: purchaseId,
    };
    
    if (warning) {
      responseBody.warning = warning;
    }

    return new Response(
      JSON.stringify(responseBody),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Payment error:", error);
    
    // ★ 例外時も必ずJSONを返す（success: false, message, code）
    let message = "Unknown error";
    const code = "UNKNOWN_ERROR";
    const statusCode = 500;

    if (error instanceof Error) {
      message = error.message;
    }

    return new Response(
      JSON.stringify({ success: false, message, code }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});