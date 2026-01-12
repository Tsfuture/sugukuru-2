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
  price_min_yen: "1dcbdf23-043c-4d06-88b3-8f796e32d296",
  price_max_yen: "ceeae4c7-703b-4f54-b46c-b6be581c1595",
  category: "149fa8bb-9413-461f-9286-3f1925c34790",
  address: "e346e267-66b6-4c79-a62d-e35bec72c33f",
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
// Typeform署名検証（HMAC-SHA256 with raw body bytes）
// Typeformは署名を base64 エンコードで送信する
// ─────────────────────────────────────────────────────────────

/**
 * Uint8Array を base64 文字列に変換（Deno環境用）
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * タイミングセーフな文字列比較
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Typeform署名を検証（raw body bytes を使用）
 * @param bodyBuffer - リクエストボディの ArrayBuffer
 * @param signatureHeader - Typeform-Signature ヘッダーの値 (形式: sha256=<base64>)
 * @param secret - TYPEFORM_WEBHOOK_SECRET
 */
async function verifyTypeformSignature(
  bodyBuffer: ArrayBuffer,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) {
    console.error("[typeform-intake] Missing signature header");
    return false;
  }

  // Typeformの署名形式: sha256=<base64_signature>
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) {
    console.error("[typeform-intake] Invalid signature format, expected 'sha256=' prefix");
    return false;
  }

  const receivedSignatureBase64 = signatureHeader.slice(expectedPrefix.length);
  console.log("[typeform-intake] Received signature (base64):", receivedSignatureBase64.substring(0, 20) + "...");

  try {
    // HMAC-SHA256 キーを作成
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // raw body bytes に対して署名を計算
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, bodyBuffer);
    
    // 計算した署名を base64 に変換
    const computedSignatureBase64 = arrayBufferToBase64(signatureBuffer);
    console.log("[typeform-intake] Computed signature (base64):", computedSignatureBase64.substring(0, 20) + "...");

    // タイミングセーフ比較
    const isValid = constantTimeEqual(computedSignatureBase64, receivedSignatureBase64);
    
    if (!isValid) {
      console.error("[typeform-intake] Signature mismatch");
      console.error("[typeform-intake] Expected:", computedSignatureBase64);
      console.error("[typeform-intake] Received:", receivedSignatureBase64);
    }
    
    return isValid;
  } catch (err) {
    console.error("[typeform-intake] Signature verification error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Typeform回答からフィールド値を抽出
// ─────────────────────────────────────────────────────────────
interface TypeformAnswer {
  field: { 
    id: string;      // 短いID（例: "abc123"）
    ref?: string;    // Block Reference UUID（例: "18b822d5-0992-406b-872b-fa339fed9d70"）
    type?: string;   // フィールドタイプ
  };
  type: string;      // 回答タイプ
  text?: string;
  number?: number;
  email?: string;
  url?: string;
  boolean?: boolean;
  choice?: { label: string; other?: string };
  choices?: { labels: string[]; other?: string };
  date?: string;
  file_url?: string;
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

/**
 * Typeform回答から適切な値を抽出
 * answer.type に基づいて正しいプロパティから値を取得
 */
function extractAnswerValue(answer: TypeformAnswer, mapping: FieldMapping): unknown {
  // answer.type を優先して値を抽出（Typeformの実際の回答タイプ）
  const answerType = answer.type;
  
  switch (answerType) {
    case 'text':
    case 'short_text':
    case 'long_text':
      return answer.text ?? null;
    case 'email':
      return answer.email ?? null;
    case 'number':
      return typeof answer.number === 'number' ? answer.number : null;
    case 'url':
    case 'website':
      return answer.url ?? null;
    case 'boolean':
    case 'yes_no':
      return typeof answer.boolean === 'boolean' ? answer.boolean : null;
    case 'choice':
      return answer.choice?.label ?? null;
    case 'choices':
      return answer.choices?.labels?.join(', ') ?? null;
    case 'date':
      return answer.date ?? null;
    case 'file_upload':
      return answer.file_url ?? null;
    default:
      // フォールバック: mapping.type に基づいて抽出
      switch (mapping.type) {
        case 'text':
          return answer.text ?? null;
        case 'email':
          return answer.email ?? answer.text ?? null;
        case 'number':
          return typeof answer.number === 'number' ? answer.number : null;
        case 'url':
          return answer.url ?? answer.text ?? null;
        case 'boolean':
          return typeof answer.boolean === 'boolean' ? answer.boolean : null;
        case 'choice':
          return answer.choice?.label ?? null;
        default:
          return answer.text ?? null;
      }
  }
}

/**
 * Typeformの回答配列をパースし、フィールド名→値のマップを返す
 * answer.field.ref（UUID）を優先して FIELD_MAPPINGS と照合
 */
function parseTypeformAnswers(answers: TypeformAnswer[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  console.log("[typeform-intake] === Answer Parsing Start ===");
  console.log("[typeform-intake] Total answers:", answers.length);

  for (const answer of answers) {
    const fieldId = answer.field?.id || "(no id)";
    const fieldRef = answer.field?.ref || "(no ref)";
    const answerType = answer.type || "(no type)";
    
    // field.ref（UUID）でマッピングを検索
    const mapping = FIELD_MAPPINGS.find((m) => m.ref === fieldRef);
    
    // デバッグログ（個人情報はマスク）
    const refShort = fieldRef.length > 10 ? fieldRef.substring(0, 8) + "..." : fieldRef;
    const matched = mapping ? `✓ ${mapping.fieldName}` : "✗ unmapped";
    console.log(`[typeform-intake] Field: id=${fieldId}, ref=${refShort}, type=${answerType} -> ${matched}`);
    
    if (mapping) {
      const value = extractAnswerValue(answer, mapping);
      result[mapping.fieldName] = value;
      
      // 抽出結果をログ（個人情報はマスク）
      let logValue: string;
      if (value === null || value === undefined) {
        logValue = "(null)";
      } else if (mapping.fieldName === 'contact_email' || mapping.fieldName === 'address') {
        // 個人情報はマスク
        logValue = String(value).substring(0, 3) + "***";
      } else if (typeof value === 'string' && value.length > 20) {
        logValue = value.substring(0, 20) + "...";
      } else {
        logValue = String(value);
      }
      console.log(`[typeform-intake]   -> Extracted ${mapping.fieldName}: ${logValue}`);
    }
  }

  console.log("[typeform-intake] === Answer Parsing End ===");
  console.log("[typeform-intake] Extracted field names:", Object.keys(result).join(", ") || "(none)");

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
    // 1. raw body を ArrayBuffer として取得（署名検証前にJSONパースしない）
    const bodyBuffer = await req.arrayBuffer();
    console.log("[typeform-intake] Body size (bytes):", bodyBuffer.byteLength);

    // 2. 署名ヘッダー取得
    const signature = req.headers.get(TYPEFORM_SIGNATURE_HEADER);
    console.log("[typeform-intake] Signature present:", !!signature);
    if (signature) {
      console.log("[typeform-intake] Signature header:", signature.substring(0, 30) + "...");
    }

    // 3. シークレット取得
    const webhookSecret = Deno.env.get("TYPEFORM_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("[typeform-intake] TYPEFORM_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("[typeform-intake] Secret configured, length:", webhookSecret.length);

    // 4. 署名検証（raw body bytes を使用）
    const isValid = await verifyTypeformSignature(bodyBuffer, signature, webhookSecret);
    if (!isValid) {
      console.error("[typeform-intake] Invalid signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("[typeform-intake] Signature verified OK");

    // 5. 署名検証後にJSONをパース
    const rawBody = new TextDecoder().decode(bodyBuffer);
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

    // 11. facility_onboarding_submissions に INSERT (または既存をチェック)
    // (source, response_id) に unique index があるため、重複時は upsert で対応
    const insertData = {
      source: "typeform",
      form_id: form_response.form_id,
      response_id: form_response.token,
      submitted_at: form_response.submitted_at,
      facility_name: parsed.facility_name as string,
      contact_email: parsed.contact_email as string,
      price_min_yen: typeof parsed.price_min_yen === 'number' ? parsed.price_min_yen : null,
      price_max_yen: typeof parsed.price_max_yen === 'number' ? parsed.price_max_yen : null,
      category: category,
      address: typeof parsed.address === 'string' && parsed.address ? parsed.address : null,
      hours_mode: hoursMode,
      hours_common: hoursCommon,
      hours_weekly: hoursWeekly,
      photo_urls: photoUrls,
      raw_payload: payload,
      status: "pending",
    };

    // 抽出結果サマリーをログ出力（個人情報はマスク）
    console.log("[typeform-intake] === Insert Data Summary ===");
    console.log("[typeform-intake] response_id:", insertData.response_id);
    console.log("[typeform-intake] facility_name:", insertData.facility_name);
    console.log("[typeform-intake] contact_email:", insertData.contact_email ? insertData.contact_email.substring(0, 3) + "***" : "(null)");
    console.log("[typeform-intake] price_min_yen:", insertData.price_min_yen);
    console.log("[typeform-intake] price_max_yen:", insertData.price_max_yen);
    console.log("[typeform-intake] category:", insertData.category);
    console.log("[typeform-intake] address:", insertData.address ? insertData.address.substring(0, 5) + "***" : "(null)");
    console.log("[typeform-intake] hours_mode:", insertData.hours_mode);
    console.log("[typeform-intake] photo_urls count:", insertData.photo_urls.length);

    console.log("[typeform-intake] Inserting submission:", {
      response_id: insertData.response_id,
      facility_name: insertData.facility_name,
    });

    // まず既存のsubmissionがあるか確認
    const { data: existingSubmission } = await supabase
      .from("facility_onboarding_submissions")
      .select("id, status, processed_facility_id")
      .eq("source", "typeform")
      .eq("response_id", form_response.token)
      .maybeSingle();

    let submissionId: string;

    if (existingSubmission) {
      // 既存のsubmissionがある場合
      console.log("[typeform-intake] Found existing submission:", existingSubmission.id);
      
      if (existingSubmission.status === "processed") {
        // 既に処理済みの場合は成功レスポンスを返す
        console.log("[typeform-intake] Already processed, returning existing facility_id");
        return new Response(
          JSON.stringify({
            message: "Already processed",
            submission_id: existingSubmission.id,
            facility_id: existingSubmission.processed_facility_id,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      
      // pending/failed の場合は再処理
      submissionId = existingSubmission.id;
      console.log("[typeform-intake] Re-processing existing submission");
    } else {
      // 新規INSERT
      const { data, error } = await supabase
        .from("facility_onboarding_submissions")
        .insert(insertData)
        .select("id")
        .single();

      if (error) {
        // 重複エラーの場合は200を返す（べき等性）
        if (error.code === "23505") {
          console.log("[typeform-intake] Duplicate response_id (race condition), skipping:", form_response.token);
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

      submissionId = data.id;
      console.log("[typeform-intake] Insert success, ID:", submissionId);
    }

    // 12. RPC で process_one_facility_onboarding_submission を呼び出し
    console.log("[typeform-intake] Calling RPC process_one_facility_onboarding_submission...");
    
    let facilityId: string | null = null;
    let processingError: string | null = null;
    
    try {
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc("process_one_facility_onboarding_submission", {
          p_submission_id: submissionId,
        });

      if (rpcError) {
        console.error("[typeform-intake] RPC error:", rpcError);
        processingError = rpcError.message;
        
        // status を failed に更新
        await supabase
          .from("facility_onboarding_submissions")
          .update({
            status: "failed",
            error_message: processingError,
          })
          .eq("id", submissionId);
      } else {
        facilityId = rpcResult;
        console.log("[typeform-intake] RPC success, facility_id:", facilityId);
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error("[typeform-intake] RPC exception:", errMessage);
      processingError = errMessage;
      
      // status を failed に更新
      await supabase
        .from("facility_onboarding_submissions")
        .update({
          status: "failed",
          error_message: processingError,
        })
        .eq("id", submissionId);
    }

    // 処理結果をレスポンス
    if (processingError) {
      return new Response(
        JSON.stringify({
          message: "Submission saved but processing failed",
          submission_id: submissionId,
          facility_name: insertData.facility_name,
          error: processingError,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Submission processed successfully",
        submission_id: submissionId,
        facility_id: facilityId,
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
