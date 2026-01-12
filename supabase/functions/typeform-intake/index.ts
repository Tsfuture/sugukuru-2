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
// Typeform Block Reference IDs
// config/typeform.ts の TYPEFORM_FIELD_IDS と同期
// Deno環境ではNode.jsモジュールをimportできないため、ここに複製
// ─────────────────────────────────────────────────────────────
const TYPEFORM_FIELD_IDS = {
  // セクション1: 基本情報
  typeform_intro_s1: "3e951198-a917-4c19-8f85-9f253edd5eca",
  facility_name: "18b822d5-0992-406b-872b-fa339fed9d70",
  contact_email: "a6baf5fd-4710-49de-8260-c271fdb939e0",
  price_min_yen: "1dcdbf23-043c-4d06-88b3-8f796e32d296",
  price_max_yen: "ceeae4c7-703b-4f54-b46c-b6be581c1595",
  category: "149fa8bb-9413-461f-9286-3f1925c34790",
  address: "e346e267-666b-4c79-a62d-e35bec72c33f",
  store_photo_upload: "0e984fb8-0fac-4b8b-beb8-364262a2cc41",

  // セクション2: 購入可能時間帯
  purchase_time_note_s2: "6efdde87-d930-4d13-ac49-b1b0c1a5de94",
  hours_is_common: "a41bbf41-b975-406f-8d38-25be91257145",
  common_start_time: "d5bed080-2692-46db-b0a7-f8968e2d53ac",
  common_end_time: "194eca42-c89f-4289-b3f8-483dbb11ce35",

  // 曜日別時間帯
  weekday_group_title_11: "012f7d9b-c65b-4199-9ff1-9d0f39cfb56d",
  mon_hours: "260e4ab3-0583-45d5-8b8b-c56f24cfd237",
  tue_hours: "000c46f1-a2de-4211-a169-f06d8736fa5a",
  wed_hours: "f25569b4-e02e-4b0d-96eb-feecb6ee20aa",
  thu_hours: "840d16a7-de6a-4390-b5cf-7923b8fd3008",
  fri_hours: "07d421df-beb0-4ec1-ae76-de7cf540d79a",
  sat_hours: "c286ee47-4311-468a-a87d-744acde2311e",
  sun_hours: "8c12fb13-599e-482e-a3d2-72f194eaa373",
  holiday_hours: "289caaa1-571e-4f28-b649-47435a5e0c12",

  // 確認・完了
  confirm_checked: "5550d5bf-e9b7-4887-8d92-feb62bd91e74",
  ending_thanks_a: "742d235a-7a18-4411-a4a1-4dd93386df78",
} as const;

// ─────────────────────────────────────────────────────────────
// 質問IDマッピング（TYPEFORM_FIELD_IDSを使用）
// ─────────────────────────────────────────────────────────────
interface FieldMapping {
  ref: string;
  fieldName: string;
  type: 'text' | 'number' | 'choice' | 'date' | 'url' | 'email' | 'boolean';
}

const FIELD_MAPPINGS: FieldMapping[] = [
  { ref: TYPEFORM_FIELD_IDS.facility_name, fieldName: 'facility_name', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.contact_email, fieldName: 'contact_email', type: 'email' },
  { ref: TYPEFORM_FIELD_IDS.price_min_yen, fieldName: 'price_min_yen', type: 'number' },
  { ref: TYPEFORM_FIELD_IDS.price_max_yen, fieldName: 'price_max_yen', type: 'number' },
  { ref: TYPEFORM_FIELD_IDS.category, fieldName: 'category', type: 'choice' },
  { ref: TYPEFORM_FIELD_IDS.address, fieldName: 'address', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.store_photo_upload, fieldName: 'store_photo_upload', type: 'url' },
  { ref: TYPEFORM_FIELD_IDS.hours_is_common, fieldName: 'hours_is_common', type: 'boolean' },
  { ref: TYPEFORM_FIELD_IDS.common_start_time, fieldName: 'common_start_time', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.common_end_time, fieldName: 'common_end_time', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.mon_hours, fieldName: 'mon_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.tue_hours, fieldName: 'tue_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.wed_hours, fieldName: 'wed_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.thu_hours, fieldName: 'thu_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.fri_hours, fieldName: 'fri_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.sat_hours, fieldName: 'sat_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.sun_hours, fieldName: 'sun_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.holiday_hours, fieldName: 'holiday_hours', type: 'text' },
  { ref: TYPEFORM_FIELD_IDS.confirm_checked, fieldName: 'confirm_checked', type: 'boolean' },
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
    const hoursIsCommon = parsed.hours_is_common === true;
    let hoursMode: string | null = null;
    let hoursCommon: object | null = null;
    let hoursWeekly: object | null = null;

    if (hoursIsCommon) {
      hoursMode = "common";
      if (parsed.common_start_time && parsed.common_end_time) {
        hoursCommon = {
          start: parsed.common_start_time,
          end: parsed.common_end_time,
        };
      }
    } else if (parsed.hours_is_common === false) {
      hoursMode = "weekly";
      // 曜日別時間は "HH:MM - HH:MM" 形式で来るので、そのまま保存
      hoursWeekly = {
        mon: parsed.mon_hours || null,
        tue: parsed.tue_hours || null,
        wed: parsed.wed_hours || null,
        thu: parsed.thu_hours || null,
        fri: parsed.fri_hours || null,
        sat: parsed.sat_hours || null,
        sun: parsed.sun_hours || null,
        holiday: parsed.holiday_hours || null,
      };
    }

    // 8. photo_urls を配列に
    const photoUrls: string[] = [];
    // store_photo_upload フィールドから写真URLを取得
    const uploadedPhoto = parsed.store_photo_upload as string | undefined;
    if (uploadedPhoto && typeof uploadedPhoto === "string" && uploadedPhoto.trim()) {
      photoUrls.push(uploadedPhoto.trim());
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
