/**
 * Typeform Webhook Intake - Supabase Edge Function
 * 
 * Typeformからの申込Webhookを受け取り、facility_onboarding_submissionsに保存
 * 
 * 🔴 手動設定が必要:
 * 1) Typeform側でWebhookを作成し、URLを https://<project>.supabase.co/functions/v1/typeform-intake に設定
 * 2) Supabase Edge Function Secretsに TYPEFORM_WEBHOOK_SECRET を設定
 *    - Typeformの Webhook設定画面 → Secret に入力した値と同じ値を設定
 * 3) config/typeform.ts の質問IDマッピングを実際のTypeformの質問IDに合わせる
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// Typeform Webhook署名検証用の定数
// ─────────────────────────────────────────────────────────────
const TYPEFORM_SIGNATURE_HEADER = "typeform-signature";

// ─────────────────────────────────────────────────────────────
// 質問IDマッピング（config/typeform.ts と同期）
// Deno環境ではimportが複雑なため、Edge Function内に直接定義
// 🔴 config/typeform.ts を変更したらここも更新すること
// ─────────────────────────────────────────────────────────────
interface FieldMapping {
  ref: string;
  fieldName: string;
  type: 'text' | 'number' | 'choice' | 'date' | 'url' | 'email' | 'boolean';
}

const FIELD_MAPPINGS: FieldMapping[] = [
  { ref: 'facility_name', fieldName: 'facility_name', type: 'text' },
  { ref: 'contact_email', fieldName: 'contact_email', type: 'email' },
  { ref: 'price_min', fieldName: 'price_min_yen', type: 'number' },
  { ref: 'price_max', fieldName: 'price_max_yen', type: 'number' },
  { ref: 'category', fieldName: 'category', type: 'choice' },
  { ref: 'address', fieldName: 'address', type: 'text' },
  { ref: 'hours_all_same', fieldName: 'hours_all_same', type: 'boolean' },
  { ref: 'hours_common_start', fieldName: 'hours_common_start', type: 'text' },
  { ref: 'hours_common_end', fieldName: 'hours_common_end', type: 'text' },
  { ref: 'hours_mon_start', fieldName: 'hours_mon_start', type: 'text' },
  { ref: 'hours_mon_end', fieldName: 'hours_mon_end', type: 'text' },
  { ref: 'hours_tue_start', fieldName: 'hours_tue_start', type: 'text' },
  { ref: 'hours_tue_end', fieldName: 'hours_tue_end', type: 'text' },
  { ref: 'hours_wed_start', fieldName: 'hours_wed_start', type: 'text' },
  { ref: 'hours_wed_end', fieldName: 'hours_wed_end', type: 'text' },
  { ref: 'hours_thu_start', fieldName: 'hours_thu_start', type: 'text' },
  { ref: 'hours_thu_end', fieldName: 'hours_thu_end', type: 'text' },
  { ref: 'hours_fri_start', fieldName: 'hours_fri_start', type: 'text' },
  { ref: 'hours_fri_end', fieldName: 'hours_fri_end', type: 'text' },
  { ref: 'hours_sat_start', fieldName: 'hours_sat_start', type: 'text' },
  { ref: 'hours_sat_end', fieldName: 'hours_sat_end', type: 'text' },
  { ref: 'hours_sun_start', fieldName: 'hours_sun_start', type: 'text' },
  { ref: 'hours_sun_end', fieldName: 'hours_sun_end', type: 'text' },
  { ref: 'hours_holiday_start', fieldName: 'hours_holiday_start', type: 'text' },
  { ref: 'hours_holiday_end', fieldName: 'hours_holiday_end', type: 'text' },
  { ref: 'photo_url_1', fieldName: 'photo_url_1', type: 'url' },
  { ref: 'photo_url_2', fieldName: 'photo_url_2', type: 'url' },
  { ref: 'photo_url_3', fieldName: 'photo_url_3', type: 'url' },
  { ref: 'photo_url_4', fieldName: 'photo_url_4', type: 'url' },
  { ref: 'photo_url_5', fieldName: 'photo_url_5', type: 'url' },
];

const CATEGORY_MAP: Record<string, string> = {
  '飲食': 'restaurant',
  'レストラン': 'restaurant',
  'Restaurant': 'restaurant',
  '美容': 'beauty',
  'サロン': 'beauty',
  'Beauty': 'beauty',
  'クリニック': 'clinic',
  '病院': 'clinic',
  'Clinic': 'clinic',
  'その他': 'other',
  'Other': 'other',
};

// ─────────────────────────────────────────────────────────────
// Typeform署名検証（HMAC-SHA256）
// ─────────────────────────────────────────────────────────────
async function verifyTypeformSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) {
    console.error("[typeform-intake] Missing signature header");
    return false;
  }

  // Typeformの署名形式: sha256=<hash>
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    console.error("[typeform-intake] Invalid signature format");
    return false;
  }

  const receivedHash = signature.slice(expectedPrefix.length);

  // HMAC-SHA256を計算
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const computedHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // タイミングセーフ比較
  if (computedHash.length !== receivedHash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ receivedHash.charCodeAt(i);
  }

  return result === 0;
}

// ─────────────────────────────────────────────────────────────
// Typeform回答からフィールド値を抽出
// ─────────────────────────────────────────────────────────────
interface TypeformAnswer {
  field: { id: string; ref: string };
  type: string;
  text?: string;
  number?: number;
  email?: string;
  url?: string;
  boolean?: boolean;
  choice?: { label: string };
  choices?: { labels: string[] };
  date?: string;
}

interface TypeformPayload {
  event_id: string;
  event_type: string;
  form_response: {
    form_id: string;
    token: string;
    submitted_at: string;
    answers: TypeformAnswer[];
  };
}

function extractAnswerValue(answer: TypeformAnswer, mapping: FieldMapping): unknown {
  switch (mapping.type) {
    case 'text':
      return answer.text || null;
    case 'email':
      return answer.email || answer.text || null;
    case 'number':
      return answer.number ?? null;
    case 'url':
      return answer.url || answer.text || null;
    case 'boolean':
      return answer.boolean ?? null;
    case 'choice':
      return answer.choice?.label || null;
    default:
      return answer.text || null;
  }
}

function parseTypeformAnswers(answers: TypeformAnswer[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const answer of answers) {
    // ref でマッピングを検索
    const mapping = FIELD_MAPPINGS.find((m) => m.ref === answer.field.ref);
    if (mapping) {
      result[mapping.fieldName] = extractAnswerValue(answer, mapping);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// メインハンドラ
// ─────────────────────────────────────────────────────────────
console.log("[typeform-intake] Function initialized");

Deno.serve(async (req) => {
  console.log("[typeform-intake] Received request");
  console.log("[typeform-intake] Method:", req.method);

  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, typeform-signature",
      },
    });
  }

  // POSTのみ許可
  if (req.method !== "POST") {
    console.log("[typeform-intake] Method not allowed:", req.method);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 1. rawBodyを取得
    const rawBody = await req.text();
    console.log("[typeform-intake] Body length:", rawBody.length);

    // 2. 署名ヘッダー取得
    const signature = req.headers.get(TYPEFORM_SIGNATURE_HEADER);
    console.log("[typeform-intake] Signature present:", !!signature);

    // 3. シークレット取得
    const webhookSecret = Deno.env.get("TYPEFORM_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("[typeform-intake] TYPEFORM_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. 署名検証
    const isValid = await verifyTypeformSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error("[typeform-intake] Invalid signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("[typeform-intake] Signature verified OK");

    // 5. Payloadパース
    const payload: TypeformPayload = JSON.parse(rawBody);
    console.log("[typeform-intake] Event type:", payload.event_type);
    console.log("[typeform-intake] Form ID:", payload.form_response.form_id);
    console.log("[typeform-intake] Response ID:", payload.form_response.token);

    // form_response_submitted イベントのみ処理
    if (payload.event_type !== "form_response") {
      console.log("[typeform-intake] Ignoring non-form_response event");
      return new Response(
        JSON.stringify({ message: "Event type ignored", event_type: payload.event_type }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 6. 回答をパース
    const { form_response } = payload;
    const parsed = parseTypeformAnswers(form_response.answers);
    console.log("[typeform-intake] Parsed fields:", Object.keys(parsed));

    // 必須フィールドチェック
    if (!parsed.facility_name) {
      console.error("[typeform-intake] Missing required field: facility_name");
      return new Response(
        JSON.stringify({ error: "Missing required field: facility_name" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!parsed.contact_email) {
      console.error("[typeform-intake] Missing required field: contact_email");
      return new Response(
        JSON.stringify({ error: "Missing required field: contact_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. hours_mode / hours_common / hours_weekly を構築
    const hoursAllSame = parsed.hours_all_same === true;
    let hoursMode: string | null = null;
    let hoursCommon: object | null = null;
    let hoursWeekly: object | null = null;

    if (hoursAllSame) {
      hoursMode = "common";
      if (parsed.hours_common_start && parsed.hours_common_end) {
        hoursCommon = {
          start: parsed.hours_common_start,
          end: parsed.hours_common_end,
        };
      }
    } else if (parsed.hours_all_same === false) {
      hoursMode = "weekly";
      hoursWeekly = {
        mon: { start: parsed.hours_mon_start || null, end: parsed.hours_mon_end || null },
        tue: { start: parsed.hours_tue_start || null, end: parsed.hours_tue_end || null },
        wed: { start: parsed.hours_wed_start || null, end: parsed.hours_wed_end || null },
        thu: { start: parsed.hours_thu_start || null, end: parsed.hours_thu_end || null },
        fri: { start: parsed.hours_fri_start || null, end: parsed.hours_fri_end || null },
        sat: { start: parsed.hours_sat_start || null, end: parsed.hours_sat_end || null },
        sun: { start: parsed.hours_sun_start || null, end: parsed.hours_sun_end || null },
        holiday: { start: parsed.hours_holiday_start || null, end: parsed.hours_holiday_end || null },
      };
    }

    // 8. photo_urls を配列に
    const photoUrls: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const url = parsed[`photo_url_${i}`] as string | undefined;
      if (url && typeof url === "string" && url.trim()) {
        photoUrls.push(url.trim());
      }
    }

    // 9. カテゴリをマッピング
    let category = parsed.category as string | null;
    if (category && CATEGORY_MAP[category]) {
      category = CATEGORY_MAP[category];
    }

    // 10. Supabaseに接続
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 11. facility_onboarding_submissions に INSERT
    // response_idはユニーク制約があるため、重複時はエラーになる（二重登録防止）
    const insertData = {
      form_id: form_response.form_id,
      response_id: form_response.token,
      submitted_at: form_response.submitted_at,
      facility_name: parsed.facility_name as string,
      contact_email: parsed.contact_email as string,
      price_min_yen: (parsed.price_min_yen as number) || null,
      price_max_yen: (parsed.price_max_yen as number) || null,
      category: category,
      address: (parsed.address as string) || null,
      hours_mode: hoursMode,
      hours_common: hoursCommon,
      hours_weekly: hoursWeekly,
      photo_urls: photoUrls,
      raw_payload: payload,
      status: "pending",
    };

    console.log("[typeform-intake] Inserting submission:", {
      response_id: insertData.response_id,
      facility_name: insertData.facility_name,
    });

    const { data, error } = await supabase
      .from("facility_onboarding_submissions")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      // 重複エラーの場合は200を返す（べき等性）
      if (error.code === "23505") {
        console.log("[typeform-intake] Duplicate response_id, skipping:", form_response.token);
        return new Response(
          JSON.stringify({ message: "Already processed", response_id: form_response.token }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      console.error("[typeform-intake] Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Database insert failed", details: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[typeform-intake] Insert success, ID:", data.id);

    return new Response(
      JSON.stringify({
        message: "Submission received",
        submission_id: data.id,
        facility_name: insertData.facility_name,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[typeform-intake] Unexpected error:", message);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
