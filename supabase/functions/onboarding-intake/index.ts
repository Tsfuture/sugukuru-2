// ============================================================================
// onboarding-intake Edge Function
// Tally Webhook から受信したオンボード申請を処理
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tally-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tally Webhook Payload の型定義
interface TallyField {
  key: string;
  label: string;
  type: string;
  value: unknown;
  options?: Array<{ id: string; text: string }>;
}

interface TallyWebhookPayload {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: {
    responseId: string;
    submissionId: string;
    respondentId: string;
    formId: string;
    formName: string;
    createdAt: string;
    fields: TallyField[];
  };
}

// フィールドからテキスト値を取得
function getFieldValue(fields: TallyField[], key: string): string | null {
  const field = fields.find(f => f.key === key || f.label.toLowerCase().includes(key.toLowerCase()));
  if (!field || field.value === null || field.value === undefined) return null;
  if (typeof field.value === 'string') return field.value;
  if (Array.isArray(field.value) && field.value.length > 0) {
    // 選択肢の場合は最初の値を返す
    const first = field.value[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first !== null && 'text' in first) {
      return (first as { text: string }).text;
    }
  }
  return String(field.value);
}

// フィールドから数値を取得
function getFieldNumber(fields: TallyField[], key: string): number | null {
  const value = getFieldValue(fields, key);
  if (value === null) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

// フィールドからファイルURLを取得
function getFileUrls(fields: TallyField[], key: string): string[] {
  const field = fields.find(f => f.key === key || f.label.toLowerCase().includes(key.toLowerCase()));
  if (!field || !field.value) return [];
  
  if (Array.isArray(field.value)) {
    return field.value
      .map((v: unknown) => {
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v !== null && 'url' in v) {
          return (v as { url: string }).url;
        }
        return null;
      })
      .filter((url): url is string => url !== null);
  }
  
  if (typeof field.value === 'object' && field.value !== null && 'url' in field.value) {
    return [(field.value as { url: string }).url];
  }
  
  return [];
}

// 営業時間フィールドをパース
// 想定フォーマット: "月-金 09:00-12:00, 13:00-17:00" など
function parseOpenIntervals(fields: TallyField[]): Array<{ dow: number; start: string; end: string }> {
  const intervals: Array<{ dow: number; start: string; end: string }> = [];
  
  // 各曜日のフィールドを探す
  const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
  const dayNamesShort = ['日', '月', '火', '水', '木', '金', '土'];
  
  for (let dow = 0; dow <= 6; dow++) {
    // 曜日ごとのフィールドを探す
    const dayField = fields.find(f => 
      f.label.includes(dayNames[dow]) || 
      f.label.includes(dayNamesShort[dow]) ||
      f.key.toLowerCase().includes(dayNamesShort[dow])
    );
    
    if (dayField && dayField.value) {
      const timeStr = String(dayField.value);
      // "09:00-12:00, 13:00-17:00" のようなフォーマットをパース
      const timeRanges = timeStr.split(/[,、]/).map(s => s.trim()).filter(s => s);
      
      for (const range of timeRanges) {
        const match = range.match(/(\d{1,2}:\d{2})\s*[-～〜]\s*(\d{1,2}:\d{2})/);
        if (match) {
          intervals.push({
            dow,
            start: match[1].padStart(5, '0'),
            end: match[2].padStart(5, '0'),
          });
        }
      }
    }
  }
  
  // 曜日ごとのフィールドがない場合、一括フィールドを探す
  if (intervals.length === 0) {
    const hoursField = fields.find(f => 
      f.label.includes('営業時間') || 
      f.label.toLowerCase().includes('hours') ||
      f.key.toLowerCase().includes('hours')
    );
    
    if (hoursField && hoursField.value) {
      const timeStr = String(hoursField.value);
      // "月-金 09:00-17:00" のようなフォーマットをパース
      const match = timeStr.match(/(\d{1,2}:\d{2})\s*[-～〜]\s*(\d{1,2}:\d{2})/);
      if (match) {
        // デフォルトで月-金に適用
        for (let dow = 1; dow <= 5; dow++) {
          intervals.push({
            dow,
            start: match[1].padStart(5, '0'),
            end: match[2].padStart(5, '0'),
          });
        }
      }
    }
  }
  
  return intervals;
}

// 画像をダウンロードしてStorageにアップロード
async function uploadPhoto(
  supabase: ReturnType<typeof createClient>,
  url: string,
  requestId: string,
  index: number
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${url}, status: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const buffer = await response.arrayBuffer();
    
    const path = `onboarding/${requestId}/${index}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('facility-images')
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });
    
    if (uploadError) {
      console.error(`Failed to upload image: ${path}`, uploadError);
      return null;
    }
    
    const { data: publicUrl } = supabase.storage
      .from('facility-images')
      .getPublicUrl(path);
    
    return publicUrl.publicUrl;
  } catch (error) {
    console.error(`Error uploading photo: ${url}`, error);
    return null;
  }
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // POST のみ受け付け
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Webhook シークレット検証
    const webhookSecret = Deno.env.get("ONBOARDING_WEBHOOK_SECRET");
    const signature = req.headers.get("x-tally-signature") || req.headers.get("x-webhook-secret");
    
    if (webhookSecret && signature !== webhookSecret) {
      console.error("Invalid webhook signature");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // リクエストボディをパース
    const payload = await req.json() as TallyWebhookPayload;
    console.log("Received Tally webhook:", JSON.stringify(payload, null, 2));

    const fields = payload.data?.fields || [];
    
    // 必須フィールドを抽出
    const facilityName = getFieldValue(fields, 'facility_name') || 
                         getFieldValue(fields, '施設名') ||
                         getFieldValue(fields, 'name') ||
                         getFieldValue(fields, '店舗名');
    
    const contactEmail = getFieldValue(fields, 'email') ||
                         getFieldValue(fields, 'メール') ||
                         getFieldValue(fields, 'contact_email');

    if (!facilityName || !contactEmail) {
      console.error("Missing required fields:", { facilityName, contactEmail });
      return new Response(
        JSON.stringify({ error: "Missing required fields: facility_name, contact_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // オプションフィールドを抽出
    const minPriceYen = getFieldNumber(fields, 'min_price') || getFieldNumber(fields, '最低価格');
    const maxPriceYen = getFieldNumber(fields, 'max_price') || getFieldNumber(fields, '最高価格');
    const category = getFieldValue(fields, 'category') || getFieldValue(fields, 'カテゴリ');
    const address = getFieldValue(fields, 'address') || getFieldValue(fields, '住所');
    const notes = getFieldValue(fields, 'notes') || getFieldValue(fields, '備考');
    
    // 営業時間をパース
    const openIntervals = parseOpenIntervals(fields);
    
    // 写真URLを取得
    const rawPhotoUrls = getFileUrls(fields, 'photo') || getFileUrls(fields, '写真');

    // Supabase クライアント初期化
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 仮のリクエストIDを生成（写真アップロード用）
    const tempRequestId = crypto.randomUUID();

    // 写真をStorageにアップロード
    const photoUrls: string[] = [];
    for (let i = 0; i < rawPhotoUrls.length; i++) {
      const uploadedUrl = await uploadPhoto(supabase, rawPhotoUrls[i], tempRequestId, i);
      if (uploadedUrl) {
        photoUrls.push(uploadedUrl);
      }
    }

    // onboarding_requests に INSERT
    const { data: request, error: insertError } = await supabase
      .from("onboarding_requests")
      .insert({
        id: tempRequestId,
        facility_name: facilityName,
        contact_email: contactEmail,
        min_price_yen: minPriceYen,
        max_price_yen: maxPriceYen,
        open_intervals: openIntervals.length > 0 ? openIntervals : null,
        photo_urls: photoUrls.length > 0 ? photoUrls : null,
        category,
        address,
        notes,
        status: 'pending',
      })
      .select("id")
      .single();

    if (insertError || !request) {
      console.error("Failed to insert onboarding request:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create onboarding request", details: insertError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Onboarding request created:", request.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        request_id: request.id,
        facility_name: facilityName,
        photo_count: photoUrls.length,
        interval_count: openIntervals.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Onboarding intake error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
