// supabase/functions/setup-card/index.ts
// カード登録完了後、PaymentMethod を Customer に紐づけ、プロフィールを更新する

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// エラーレスポンス用のヘルパー
interface ErrorResponse {
  success: false;
  error_code: string;
  message: string;
  details?: string;
}

function errorJson(
  status: number,
  errorCode: string,
  message: string,
  details?: string
): Response {
  const body: ErrorResponse = {
    success: false,
    error_code: errorCode,
    message,
    ...(details && { details }),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("[setup-card] Function invoked");

  try {
    // ─────────────────────────────────────────────
    // 1. Authorization ヘッダーからユーザーを取得
    // ─────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[setup-card] No authorization header");
      return errorJson(401, "AUTH_MISSING", "認証情報がありません");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[setup-card] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return errorJson(500, "CONFIG_ERROR", "サーバー設定エラー");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("[setup-card] User auth error:", userError?.message);
      return errorJson(401, "AUTH_INVALID", "認証に失敗しました", userError?.message);
    }

    console.log(`[setup-card] Authenticated user: ${user.id} (${user.email})`);

    // ─────────────────────────────────────────────
    // 2. リクエストボディから paymentMethodId を取得
    // ─────────────────────────────────────────────
    let body: { paymentMethodId?: string };
    try {
      body = await req.json();
    } catch {
      console.error("[setup-card] Failed to parse request body");
      return errorJson(400, "INVALID_BODY", "リクエスト形式が不正です");
    }

    const { paymentMethodId } = body;
    if (!paymentMethodId || typeof paymentMethodId !== "string") {
      console.error("[setup-card] No paymentMethodId provided");
      return errorJson(400, "MISSING_PAYMENT_METHOD", "支払い方法IDが必要です");
    }

    console.log(`[setup-card] paymentMethodId: ${paymentMethodId}`);

    // ─────────────────────────────────────────────
    // 3. Stripe 初期化
    // ─────────────────────────────────────────────
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("[setup-card] STRIPE_SECRET_KEY is not set");
      return errorJson(500, "STRIPE_CONFIG_ERROR", "Stripe設定エラー");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
    });

    // ─────────────────────────────────────────────
    // 4. プロフィールから stripe_customer_id を取得（なければ作成）
    //    upsert を使用して profiles レコードが確実に存在することを保証
    // ─────────────────────────────────────────────
    
    // まず profiles レコードが存在することを保証（upsert）
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        { 
          id: user.id, 
          email: user.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: false }
      );

    if (upsertError) {
      console.error("[setup-card] Profile upsert error:", upsertError.message);
      // upsert失敗しても続行を試みる
    }

    // stripe_customer_id を取得
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[setup-card] Profile fetch error:", profileError.message);
      return errorJson(500, "PROFILE_FETCH_ERROR", "プロフィール取得に失敗", profileError.message);
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      console.log("[setup-card] Creating new Stripe customer...");
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id,
          },
        });
        customerId = customer.id;
        console.log(`[setup-card] Created Stripe customer: ${customerId}`);

        const { error: updateError } = await supabase
          .from("profiles")
          .upsert(
            { 
              id: user.id,
              email: user.email,
              stripe_customer_id: customerId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (updateError) {
          console.error("[setup-card] Failed to save stripe_customer_id:", updateError.message);
        }
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[setup-card] Stripe customer creation failed:", msg);
        return errorJson(500, "STRIPE_CUSTOMER_ERROR", "Stripe顧客作成に失敗", msg);
      }
    } else {
      console.log(`[setup-card] Existing Stripe customer: ${customerId}`);
    }

    // ─────────────────────────────────────────────
    // 5. PaymentMethod を Customer に attach（既にattach済みなら無視）
    // ─────────────────────────────────────────────
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      console.log(`[setup-card] Attached payment method ${paymentMethodId} to customer ${customerId}`);
    } catch (attachError: unknown) {
      // 既にattach済みの場合は無視（resource_already_existsなど）
      const errMsg = attachError instanceof Error ? attachError.message : String(attachError);
      if (errMsg.includes("already been attached") || errMsg.includes("resource_already_exists")) {
        console.log("[setup-card] PaymentMethod already attached, continuing...");
      } else {
        console.error("[setup-card] PaymentMethod attach failed:", errMsg);
        return errorJson(400, "ATTACH_ERROR", "カードの紐付けに失敗しました", errMsg);
      }
    }

    // ─────────────────────────────────────────────
    // 6. Customer のデフォルト支払い方法に設定
    // ─────────────────────────────────────────────
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log(`[setup-card] Set default payment method for customer ${customerId}`);
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.error("[setup-card] Failed to set default payment method:", msg);
      return errorJson(500, "DEFAULT_PM_ERROR", "デフォルト支払い方法の設定に失敗", msg);
    }

    // ─────────────────────────────────────────────
    // 7. PaymentMethod の詳細を取得してプロフィールに保存
    //    upsert を使用して確実に保存
    // ─────────────────────────────────────────────
    let cardDetails: Stripe.PaymentMethod.Card | undefined;
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      cardDetails = paymentMethod.card;
      console.log(`[setup-card] Card details: brand=${cardDetails?.brand}, last4=${cardDetails?.last4}`);
    } catch (retrieveErr) {
      const msg = retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr);
      console.error("[setup-card] Failed to retrieve payment method:", msg);
      // カード詳細取得失敗しても続行（致命的ではない）
    }

    // プロフィール更新（has_payment_method = true が最重要）
    // upsert を使用して profiles レコードがない場合も対応
    const profileData = {
      id: user.id,
      email: user.email,
      stripe_customer_id: customerId,
      has_payment_method: true,
      default_payment_method_id: paymentMethodId,
      card_brand: cardDetails?.brand || null,
      card_last4: cardDetails?.last4 || null,
      card_exp_month: cardDetails?.exp_month || null,
      card_exp_year: cardDetails?.exp_year || null,
      updated_at: new Date().toISOString(),
    };

    const { error: finalUpdateError } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "id" });

    if (finalUpdateError) {
      console.error("[setup-card] Profile upsert failed:", finalUpdateError.message);
      console.error("[setup-card] Attempted data:", JSON.stringify(profileData));
      return errorJson(500, "PROFILE_UPDATE_ERROR", "プロフィール更新に失敗", finalUpdateError.message);
    }

    console.log(`[setup-card] ✅ SUCCESS - Card setup complete for user: ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        card: {
          brand: cardDetails?.brand,
          last4: cardDetails?.last4,
          exp_month: cardDetails?.exp_month,
          exp_year: cardDetails?.exp_year,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[setup-card] Unhandled error:", message, stack);

    return errorJson(500, "UNKNOWN_ERROR", "予期しないエラーが発生しました", message);
  }
});
