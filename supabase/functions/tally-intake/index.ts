// deno-lint-ignore-file no-import-prefix
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// 型定義
// ============================================================================
interface TallyField {
  key: string;
  label: string;
  type: string;
  value: unknown;
  options?: { id: string; text: string }[];
}

interface TallyData {
  responseId?: string;
  formId?: string;
  formName?: string;
  fields?: TallyField[];
}

interface TallyPayload {
  eventId?: string;
  eventType?: string;
  createdAt?: string;
  data?: TallyData;
}

interface OpenInterval {
  dow: number;
  start: string;
  end: string;
}

// ============================================================================
// 曜日マッピング（Sun=0, Mon=1, ... Sat=6）
// ============================================================================
const DOW_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// ============================================================================
// open_intervals パース
// 入力例：`Mon 09:00-16:00, 17:00-23:00 / Tue 09:00-16:00 / Wed closed`
// ============================================================================
function parseOpenIntervals(text: string): OpenInterval[] {
  const intervals: OpenInterval[] = [];
  // 区切り: `/` または改行
  const lines = text.split(/[/\n]/).map((s) => s.trim()).filter(Boolean);

  for (const line of lines) {
    // 曜日を先頭で判定
    const match = line.match(/^(sun|mon|tue|wed|thu|fri|sat)\s+/i);
    if (!match) continue;

    const dowStr = match[1].toLowerCase();
    const dow = DOW_MAP[dowStr];
    if (dow === undefined) continue;

    const rest = line.slice(match[0].length).trim();

    // "closed" なら空
    if (/closed/i.test(rest)) {
      continue;
    }

    // 時間帯: `09:00-16:00` 形式、複数枠は `,` 区切り
    const slots = rest.split(",").map((s) => s.trim()).filter(Boolean);
    for (const slot of slots) {
      const timeMatch = slot.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (timeMatch) {
        intervals.push({
          dow,
          start: timeMatch[1].padStart(5, "0"),
          end: timeMatch[2].padStart(5, "0"),
        });
      }
    }
  }

  return intervals;
}

// ============================================================================
// 拡張子推定
// ============================================================================
function getExtFromMimeOrName(name?: string, mimeType?: string): string {
  if (name) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext && ["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }
  if (mimeType) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("heic")) return "heic";
  }
  return "jpg";
}

// ============================================================================
// メイン処理
// ============================================================================
serve(async (req: Request) => {
  try {
    // POST以外は 200 OK を返す
    if (req.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    // ---- 1) Webhook 認証（Tally側: Authorization: Bearer <token>）
    const auth = req.headers.get("authorization") ?? "";
    const expected = Deno.env.get("ONBOARDING_WEBHOOK_SECRET") ?? "";
    const expectedHeader = `Bearer ${expected}`;

    if (!expected || auth !== expectedHeader) {
      console.log("Unauthorized:", { authPresent: !!auth });
      return new Response(
        JSON.stringify({ code: 401, message: "Unauthorized" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }

    // ---- 2) payload 読み取り
    const payload = (await req.json()) as TallyPayload;
    console.log("Tally payload received:", {
      eventType: payload?.eventType,
      eventId: payload?.eventId,
      formName: payload?.data?.formName,
    });

    // ---- 3) Supabase client（service roleでRLS無視してINSERT）
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- 4) fields からデータ抽出
    const fields = payload.data?.fields ?? [];

    let facilityName: string | null = null;
    let contactEmail: string | null = null;
    let minPriceYen: number | null = null;
    let maxPriceYen: number | null = null;
    let openIntervalsRaw: string | null = null;
    const categories: string[] = [];
    const fileUploads: { url: string; name?: string; mimeType?: string }[] = [];

    for (const field of fields) {
      const label = field.label ?? "";
      const type = field.type ?? "";
      const value = field.value;

      // facility_name: 「Webサイト・購入ページに表示されます」 を含む label の value
      if (label.includes("Webサイト・購入ページに表示されます")) {
        if (typeof value === "string" && value.trim()) {
          facilityName = value.trim();
        }
      }

      // contact_email: type=INPUT_EMAIL または 「導入に関する連絡」を含む label
      if (type === "INPUT_EMAIL" || label.includes("導入に関する連絡")) {
        if (typeof value === "string" && value.includes("@")) {
          contactEmail = value.trim();
        }
      }

      // min_price_yen: label に "(min)" を含む INPUT_NUMBER
      if (type === "INPUT_NUMBER" && label.toLowerCase().includes("(min)")) {
        const num = Number(value);
        if (!isNaN(num)) {
          minPriceYen = num;
        }
      }

      // max_price_yen: label に "(max)" を含む INPUT_NUMBER
      if (type === "INPUT_NUMBER" && label.toLowerCase().includes("(max)")) {
        const num = Number(value);
        if (!isNaN(num)) {
          maxPriceYen = num;
        }
      }

      // open_intervals: label に「営業時間」を含む TEXTAREA
      if (type === "TEXTAREA" && label.includes("営業時間")) {
        if (typeof value === "string") {
          openIntervalsRaw = value;
        }
      }

      // categories: label に「カテゴリ」を含む DROPDOWN
      if (type === "DROPDOWN" && label.includes("カテゴリ")) {
        // value は option id（または配列）、optionsから text を取得
        const opts = field.options ?? [];
        if (Array.isArray(value)) {
          for (const v of value) {
            const opt = opts.find((o) => o.id === v);
            if (opt) categories.push(opt.text);
          }
        } else if (typeof value === "string") {
          const opt = opts.find((o) => o.id === value);
          if (opt) categories.push(opt.text);
        }
      }

      // 画像（FILE_UPLOAD or 「店舗写真」を含む label）
      if (type === "FILE_UPLOAD" || label.includes("店舗写真")) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === "object" && "url" in item) {
              fileUploads.push({
                url: item.url as string,
                name: item.name as string | undefined,
                mimeType: item.mimeType as string | undefined,
              });
            }
          }
        }
      }
    }

    // open_intervals をパース
    const openIntervals = openIntervalsRaw
      ? parseOpenIntervals(openIntervalsRaw)
      : [];

    console.log("Extracted data:", {
      facilityName,
      contactEmail,
      minPriceYen,
      maxPriceYen,
      categoriesCount: categories.length,
      intervalsCount: openIntervals.length,
      photoCount: fileUploads.length,
    });

    // ---- 5) まず onboarding_requests に INSERT
    const insertData = {
      facility_name: facilityName || "Tally Submission",
      contact_email: contactEmail || "unknown@example.com",
      min_price_yen: minPriceYen,
      max_price_yen: maxPriceYen,
      open_intervals: openIntervals.length > 0 ? openIntervals : null,
      categories: categories.length > 0 ? categories : null,
      photo_urls: null as string[] | null,
      notes: JSON.stringify(payload),
      status: "pending",
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from("onboarding_requests")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      console.log("Insert error:", insertError);
      return new Response(
        JSON.stringify({ code: 500, message: insertError.message }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }

    const requestId = insertedRow.id as string;
    console.log("Inserted onboarding_requests id:", requestId);

    // ---- 6) 画像を Storage に退避して photo_urls を更新
    const photoUrls: string[] = [];

    if (fileUploads.length > 0) {
      for (let i = 0; i < fileUploads.length; i++) {
        const file = fileUploads[i];
        try {
          // Tally URLから画像を取得
          const res = await fetch(file.url);
          if (!res.ok) {
            console.log(`Failed to fetch image ${i}:`, res.status);
            continue;
          }

          const blob = await res.blob();
          const ext = getExtFromMimeOrName(file.name, file.mimeType);
          const path = `onboarding/${requestId}/${i}.${ext}`;

          // Storage に upload
          const { error: uploadError } = await supabase.storage
            .from("facility-images")
            .upload(path, blob, {
              contentType: file.mimeType || "image/jpeg",
              upsert: true,
            });

          if (uploadError) {
            console.log(`Storage upload error for ${i}:`, uploadError.message);
            continue;
          }

          // public URL を取得
          const { data: urlData } = supabase.storage
            .from("facility-images")
            .getPublicUrl(path);

          if (urlData?.publicUrl) {
            photoUrls.push(urlData.publicUrl);
            console.log(`Uploaded image ${i}:`, urlData.publicUrl);
          }
        } catch (e) {
          console.log(`Error processing image ${i}:`, e);
        }
      }

      // photo_urls を UPDATE
      if (photoUrls.length > 0) {
        const { error: updateError } = await supabase
          .from("onboarding_requests")
          .update({ photo_urls: photoUrls })
          .eq("id", requestId);

        if (updateError) {
          console.log("Failed to update photo_urls:", updateError.message);
        } else {
          console.log("Updated photo_urls:", photoUrls.length, "images");
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, request_id: requestId }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    console.log("Unhandled error:", e);
    return new Response(
      JSON.stringify({ code: 500, message: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
