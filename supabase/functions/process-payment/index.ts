import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

// ピーク時間帯の判定（18:00〜21:00 JST）
function isPeakTime(): boolean {
  // Convert to JST (UTC+9)
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;
  return jstHour >= 18 && jstHour < 21;
}

// サーバー側でダイナミックプライシング計算
function calcDynamicPrice(facilityId: string): { unitPrice: number; dynamicFee: number } {
  const config = PRICING_TABLE[facilityId] || PRICING_TABLE.default;
  const basePrice = config.base;
  const dynamicFee = isPeakTime() ? config.peakExtra : 0;
  
  return {
    unitPrice: basePrice + dynamicFee,
    dynamicFee,
  };
}

// 購入確認メールを送信
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
    const resend = new Resend(resendApiKey);
    
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
    
    const { error } = await resend.emails.send({
      from: "SUGUKURU <onboarding@resend.dev>",
      to: [email],
      subject: "[SUGUKURU] FastPass 購入内容のご案内",
      text: emailBody,
    });
    
    if (error) {
      console.error("Email send error:", error);
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
    return new Response(null, { headers: corsHeaders });
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

    const { facilityId, quantity } = await req.json();

    console.log(`Processing payment for user: ${user.id}, facility: ${facilityId}, quantity: ${quantity}`);

    // Validate input
    if (!facilityId || !quantity || quantity < 1 || quantity > 6) {
      return new Response(
        JSON.stringify({ error: "Invalid parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate price SERVER-SIDE (security: never trust client-supplied price)
    const facilityConfig = PRICING_TABLE[facilityId] || PRICING_TABLE.default;
    const { unitPrice, dynamicFee } = calcDynamicPrice(facilityId);
    const totalAmount = unitPrice * quantity;

    console.log(`Price calculation - base: ${facilityConfig.base}, dynamicFee: ${dynamicFee}, unitPrice: ${unitPrice}, total: ${totalAmount}`);

    // Initialize Stripe
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

    // Get customer's default payment method
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
    
    if (customer.deleted) {
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const defaultPaymentMethod = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    
    if (!defaultPaymentMethod) {
      return new Response(
        JSON.stringify({ error: "No default payment method" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating PaymentIntent for ${totalAmount} JPY`);

    // Create and confirm PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "jpy",
      customer: profile.stripe_customer_id,
      payment_method: defaultPaymentMethod as string,
      off_session: true,
      confirm: true,
      description: `${facilityConfig.name} - SUGUKURU FastPass x${quantity}`,
      metadata: {
        facilityId,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        dynamicFee: String(dynamicFee),
        totalAmount: String(totalAmount),
        userId: user.id,
      },
    });

    console.log(`PaymentIntent created: ${paymentIntent.id}, status: ${paymentIntent.status}`);

    if (paymentIntent.status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: "Payment failed", status: paymentIntent.status }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save purchase history with all required fields
    const purchasedAt = new Date().toISOString();
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchase_history")
      .insert({
        user_id: user.id,
        email: user.email,
        facility_id: facilityId,
        facility_name: facilityConfig.name,
        quantity: quantity,
        unit_price: unitPrice,
        dynamic_fee: dynamicFee,
        total_amount: totalAmount,
        currency: "jpy",
        stripe_payment_intent_id: paymentIntent.id,
        status: "succeeded",
        purchased_at: purchasedAt,
      })
      .select()
      .single();

    if (purchaseError) {
      console.error("Purchase history error:", purchaseError);
      // Payment succeeded but history save failed - log but don't fail
    }

    console.log(`Payment successful for user: ${user.id}, purchase: ${purchase?.id}`);

    // Send confirmation email (non-blocking)
    const userEmail = user.email || profile.email;
    if (userEmail) {
      // Use EdgeRuntime.waitUntil if available, otherwise just await
      try {
        await sendConfirmationEmail(
          userEmail,
          facilityConfig.name,
          quantity,
          totalAmount,
          purchasedAt
        );
      } catch (emailError) {
        console.error("Email send failed:", emailError);
        // Don't fail the transaction for email errors
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        purchaseId: purchase?.id,
        paymentIntentId: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Payment error:", error);
    
    // Handle Stripe card errors
    if (error instanceof Stripe.errors.StripeCardError) {
      return new Response(
        JSON.stringify({ error: "カードが拒否されました。別のカードをお試しください。" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});