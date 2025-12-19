import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Receive the payment method ID from the client (created securely via Stripe Elements)
    const { paymentMethodId } = await req.json();

    if (!paymentMethodId) {
      console.error("No paymentMethodId provided");
      return new Response(
        JSON.stringify({ error: "Payment method ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Setting up card for user: ${user.id}, paymentMethodId: ${paymentMethodId}`);

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

    // Get customer ID from profile
    let { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer if not exists
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      console.log(`Created Stripe customer: ${customerId}`);

      // Update profile with Stripe customer ID
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Attach payment method to customer (if not already attached)
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      console.log(`Attached payment method ${paymentMethodId} to customer ${customerId}`);
    } catch (attachError: unknown) {
      // Payment method might already be attached (e.g., via SetupIntent confirmation)
      console.log("Payment method attachment note:", attachError instanceof Error ? attachError.message : "Already attached");
    }

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Retrieve payment method details to store masked card info
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const cardDetails = paymentMethod.card;

    console.log(`Retrieved card details: brand=${cardDetails?.brand}, last4=${cardDetails?.last4}`);

    // Update profile with payment method info (only IDs and masked data - NO raw card numbers!)
    await supabase
      .from("profiles")
      .update({ 
        has_payment_method: true,
        default_payment_method_id: paymentMethodId,
        card_brand: cardDetails?.brand || null,
        card_last4: cardDetails?.last4 || null,
        card_exp_month: cardDetails?.exp_month || null,
        card_exp_year: cardDetails?.exp_year || null,
      })
      .eq("id", user.id);

    console.log(`Card setup complete for user: ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        card: {
          brand: cardDetails?.brand,
          last4: cardDetails?.last4,
          exp_month: cardDetails?.exp_month,
          exp_year: cardDetails?.exp_year,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Card setup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
