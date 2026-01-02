// バージョン確認用 Edge Function
// デプロイ状況を確認するためのエンドポイント

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// ★ バージョン情報
const VERSION = "2.0.0-dynamic-pricing";
const BUILD_TIME = "2026-01-02T00:00:00Z";

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const responseBody = {
    version: VERSION,
    build_time: BUILD_TIME,
    functions: {
      "process-payment": "2.0.0-dynamic-pricing",
      "get-price": "1.0.0",
      "checkout": "2.0.0-dynamic-pricing",
      "store-checkout": "2.0.0-dynamic-pricing",
    },
    timestamp: new Date().toISOString(),
    message: "ダイナミックプライシング対応版がデプロイされています",
  };

  return new Response(
    JSON.stringify(responseBody, null, 2),
    { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
});
