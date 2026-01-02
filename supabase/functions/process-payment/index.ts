import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ★ バージョン情報（デプロイ確認用）
const FUNCTION_VERSION = "2.0.0-dynamic-pricing";
const BUILD_TIME = "2026-01-02T00:00:00Z";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Store型定義（ダイナミックプライシング対応）
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

// Calculate 10-minute time slot ID
function getSlotId(): string {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / 600); // 10-minute slots
  return `slot_${slot}`;
}

// DBから店舗情報を取得し、get-priceと同じダイナミックプライシングで価格計算
async function getStoreAndCalcPrice(
  supabase: SupabaseClient,
  facilityId: string
): Promise<{ store: Store; unitPrice: number; dynamicFee: number } | { error: string; status: number }> {
  // get-priceと同じカラムを取得
  const { data: store, error } = await supabase
    .from("stores")
    .select(`
      id, name, fastpass_price, peak_extra_price, is_open,
      current_wait_time, dynamic_enabled, avg_spend_yen, turnover_per_hour,
      target_fastpass_per_hour, min_price, max_price, k_util, k_step, k_wait, k_env
    `)
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

  const storeData = store as Store;

  // ★ get-price と同じダイナミックプライシングロジック
  if (!storeData.dynamic_enabled) {
    // ダイナミックプライシング無効時: 従来のピーク時間帯計算
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    const isPeak = jstHour >= 18 && jstHour < 21;
    const dynamicFee = isPeak ? (storeData.peak_extra_price || 0) : 0;
    const unitPrice = storeData.fastpass_price + dynamicFee;

    console.log(`[price-calc] dynamic_enabled=false, base=${storeData.fastpass_price}, dynamicFee=${dynamicFee}, unitPrice=${unitPrice}`);
    return { store: storeData, unitPrice, dynamicFee };
  }

  // ★ ダイナミックプライシング有効時: get-price と完全同一のロジック
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const slotStartSeconds = Math.floor(Date.now() / 1000 / 600) * 600;
  const slotStart = new Date(slotStartSeconds * 1000);
  const slotId = getSlotId();

  // Count purchases in the last hour for utilization
  const { count: hourlyPurchases, error: hourlyError } = await supabase
    .from("purchase_history")
    .select("*", { count: "exact", head: true })
    .eq("facility_id", facilityId)
    .eq("status", "completed")
    .gte("created_at", oneHourAgo.toISOString());

  if (hourlyError) {
    console.warn("Hourly purchase count error (using fallback):", hourlyError);
  }

  // Count purchases in current 10-minute slot
  const { count: slotPurchases, error: slotError } = await supabase
    .from("purchase_history")
    .select("*", { count: "exact", head: true })
    .eq("facility_id", facilityId)
    .eq("status", "completed")
    .gte("created_at", slotStart.toISOString());

  if (slotError) {
    console.warn("Slot purchase count error (using fallback):", slotError);
  }

  // Calculate utilization (0-1 range, can exceed 1 if over target)
  const effectiveHourlyPurchases = hourlyPurchases ?? 0;
  const effectiveSlotPurchases = slotPurchases ?? 0;
  const util = storeData.target_fastpass_per_hour > 0
    ? effectiveHourlyPurchases / storeData.target_fastpass_per_hour
    : 0;

  // Environment score based on wait time (longer wait = higher congestion)
  // Normalize: 30 minutes = env_score of 1.0
  const envScore = Math.min(storeData.current_wait_time / 30, 2.0);

  // Base price calculation: 60% of average spend, clamped to min/max
  const rawBase = Math.round(storeData.avg_spend_yen * 0.6);
  const basePrice = clamp(rawBase, storeData.min_price, storeData.max_price);

  // Calculate effects
  const utilEffect = storeData.k_util * util;
  const stepEffect = storeData.k_step * effectiveSlotPurchases;
  const waitEffect = storeData.k_wait * storeData.current_wait_time;
  const envEffect = storeData.k_env * envScore;

  // Total multiplier
  const multiplier = 1 + utilEffect + stepEffect + waitEffect + envEffect;

  // Calculate final price
  const rawPrice = basePrice * multiplier;
  const clampedPrice = clamp(rawPrice, storeData.min_price, storeData.max_price);
  const finalPrice = roundTo10Yen(clampedPrice);

  // dynamicFee は basePrice からの差分として計算
  const dynamicFee = finalPrice - storeData.fastpass_price;

  console.log(`[price-calc] dynamic_enabled=true, slot=${slotId}, base=${basePrice}, multiplier=${multiplier.toFixed(3)}, finalPrice=${finalPrice}, dynamicFee=${dynamicFee}`);

  return { store: storeData, unitPrice: finalPrice, dynamicFee };
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

    const { facilityId, quantity, orderKey, traceId } = await req.json();

    // ★ TRACE: リクエスト受信ログ
    console.info(`[TRACE] process-payment received`, {
      traceId: traceId || "NO_TRACE_ID",
      version: FUNCTION_VERSION,
      buildTime: BUILD_TIME,
      facilityId,
      quantity,
      orderKey,
      userId: user.id,
    });

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

    // ★ TRACE: Stripe呼び出し直前のログ
    console.info(`[TRACE] stripe_create`, {
      traceId: traceId || "NO_TRACE_ID",
      version: FUNCTION_VERSION,
      amount: totalAmount,
      currency: "jpy",
      facility_id: facilityId,
      quantity: qty,
      price_yen: unitPrice,
      dynamic_enabled: store.dynamic_enabled,
    });

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
      // ★ デバッグ/トレース情報
      version: FUNCTION_VERSION,
      traceId: traceId || null,
      computed_amount: totalAmount,
      price_yen: unitPrice,
      dynamic_enabled: store.dynamic_enabled,
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