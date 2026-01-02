import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Store type from DB (with dynamic pricing columns)
interface Store {
  id: string;
  name: string;
  description: string | null;
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

interface PriceBreakdown {
  base_price: number;
  util: number;
  slot_purchases: number;
  step_effect: number;
  wait_effect: number;
  env_effect: number;
  final_multiplier: number;
}

interface GetPriceResponse {
  price_yen: number;
  breakdown: PriceBreakdown;
  store: {
    id: string;
    name: string;
    description: string | null;
    is_open: boolean;
  };
  dynamic_enabled: boolean;
  slot_id: string;
}

// Calculate 10-minute time slot ID
function getSlotId(): string {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / 600); // 10-minute slots
  return `slot_${slot}`;
}

// Round to nearest 10 yen
function roundTo10Yen(price: number): number {
  return Math.round(price / 10) * 10;
}

// Clamp value between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { store_id } = await req.json();

    if (!store_id) {
      return new Response(
        JSON.stringify({ error: "store_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch store data
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select(`
        id, name, description, fastpass_price, peak_extra_price, is_open,
        current_wait_time, dynamic_enabled, avg_spend_yen, turnover_per_hour,
        target_fastpass_per_hour, min_price, max_price, k_util, k_step, k_wait, k_env
      `)
      .eq("id", store_id)
      .single();

    if (storeError || !store) {
      console.error("Store fetch error:", storeError);
      return new Response(
        JSON.stringify({ error: `Store not found: ${store_id}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const storeData = store as Store;

    // If dynamic pricing is disabled, use fallback (fastpass_price + peak)
    if (!storeData.dynamic_enabled) {
      const now = new Date();
      const jstHour = (now.getUTCHours() + 9) % 24;
      const isPeak = jstHour >= 18 && jstHour < 21;
      const dynamicFee = isPeak ? (storeData.peak_extra_price || 0) : 0;
      const price = storeData.fastpass_price + dynamicFee;

      const response: GetPriceResponse = {
        price_yen: price,
        breakdown: {
          base_price: storeData.fastpass_price,
          util: 0,
          slot_purchases: 0,
          step_effect: 0,
          wait_effect: 0,
          env_effect: isPeak ? dynamicFee : 0,
          final_multiplier: 1,
        },
        store: {
          id: storeData.id,
          name: storeData.name,
          description: storeData.description,
          is_open: storeData.is_open,
        },
        dynamic_enabled: false,
        slot_id: getSlotId(),
      };

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dynamic pricing calculation
    const slotId = getSlotId();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const slotStartSeconds = Math.floor(Date.now() / 1000 / 600) * 600;
    const slotStart = new Date(slotStartSeconds * 1000);

    // Count purchases in the last hour for utilization
    // purchase_history uses facility_id which maps to stores.id
    const { count: hourlyPurchases, error: hourlyError } = await supabase
      .from("purchase_history")
      .select("*", { count: "exact", head: true })
      .eq("facility_id", store_id)
      .eq("status", "completed")
      .gte("created_at", oneHourAgo.toISOString());

    if (hourlyError) {
      console.warn("Hourly purchase count error (using fallback):", hourlyError);
    }

    // Count purchases in current 10-minute slot
    const { count: slotPurchases, error: slotError } = await supabase
      .from("purchase_history")
      .select("*", { count: "exact", head: true })
      .eq("facility_id", store_id)
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

    const breakdown: PriceBreakdown = {
      base_price: basePrice,
      util: util,
      slot_purchases: effectiveSlotPurchases,
      step_effect: stepEffect,
      wait_effect: waitEffect,
      env_effect: envEffect,
      final_multiplier: multiplier,
    };

    const response: GetPriceResponse = {
      price_yen: finalPrice,
      breakdown,
      store: {
        id: storeData.id,
        name: storeData.name,
        description: storeData.description,
        is_open: storeData.is_open,
      },
      dynamic_enabled: true,
      slot_id: slotId,
    };

    console.log(`Dynamic price calculated for ${store_id}:`, {
      price: finalPrice,
      breakdown,
      slot: slotId,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Get price error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
