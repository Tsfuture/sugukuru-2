/**
 * Typeform 質問ID → 項目名マッピング設定
 * 
 * Typeformのpayloadは以下の形式で回答が来ます:
 * {
 *   "form_response": {
 *     "form_id": "abc123",
 *     "token": "response_id",
 *     "submitted_at": "2024-01-01T00:00:00Z",
 *     "answers": [
 *       { "field": { "id": "question_id", "ref": "question_ref" }, "type": "text", "text": "回答" },
 *       ...
 *     ]
 *   }
 * }
 */

// ─────────────────────────────────────────────────────────────
// Typeform Block Reference IDs
// Typeform Webhookで受け取るフィールドIDを一元管理
// ─────────────────────────────────────────────────────────────
export const TYPEFORM_FIELD_IDS = {
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

export type TypeformFieldId = keyof typeof TYPEFORM_FIELD_IDS;

export interface TypeformFieldMapping {
  // 質問のref（Typeformで設定したReference ID）
  ref: string;
  // 内部項目名
  fieldName: string;
  // 回答タイプ（text, number, choice, date, url, etc.）
  type: 'text' | 'number' | 'choice' | 'date' | 'url' | 'email' | 'boolean';
  // 必須かどうか
  required: boolean;
  // 説明（コメント用）
  description: string;
}

/**
 * Typeform質問ref → 内部フィールド名マッピング
 * TYPEFORM_FIELD_IDS の値をrefとして使用
 */
export const TYPEFORM_FIELD_MAPPINGS: TypeformFieldMapping[] = [
  {
    ref: TYPEFORM_FIELD_IDS.facility_name,
    fieldName: 'facility_name',
    type: 'text',
    required: true,
    description: '店舗/施設名',
  },
  {
    ref: TYPEFORM_FIELD_IDS.contact_email,
    fieldName: 'contact_email',
    type: 'email',
    required: true,
    description: '連絡先メールアドレス',
  },
  {
    ref: TYPEFORM_FIELD_IDS.price_min_yen,
    fieldName: 'price_min_yen',
    type: 'number',
    required: false,
    description: '価格レンジ下限（円）',
  },
  {
    ref: TYPEFORM_FIELD_IDS.price_max_yen,
    fieldName: 'price_max_yen',
    type: 'number',
    required: false,
    description: '価格レンジ上限（円）',
  },
  {
    ref: TYPEFORM_FIELD_IDS.category,
    fieldName: 'category',
    type: 'choice',
    required: false,
    description: 'カテゴリ（restaurant/beauty/clinic/other）',
  },
  {
    ref: TYPEFORM_FIELD_IDS.address,
    fieldName: 'address',
    type: 'text',
    required: false,
    description: '住所',
  },
  {
    ref: TYPEFORM_FIELD_IDS.store_photo_upload,
    fieldName: 'store_photo_upload',
    type: 'url',
    required: false,
    description: '店舗写真アップロード',
  },
  {
    ref: TYPEFORM_FIELD_IDS.hours_is_common,
    fieldName: 'hours_is_common',
    type: 'boolean',
    required: false,
    description: '営業時間は全曜日共通ですか？',
  },
  // 共通時間帯
  {
    ref: TYPEFORM_FIELD_IDS.common_start_time,
    fieldName: 'common_start_time',
    type: 'text',
    required: false,
    description: '共通開始時刻（HH:MM）',
  },
  {
    ref: TYPEFORM_FIELD_IDS.common_end_time,
    fieldName: 'common_end_time',
    type: 'text',
    required: false,
    description: '共通終了時刻（HH:MM）',
  },
  // 曜日別時間帯
  {
    ref: TYPEFORM_FIELD_IDS.mon_hours,
    fieldName: 'mon_hours',
    type: 'text',
    required: false,
    description: '月曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.tue_hours,
    fieldName: 'tue_hours',
    type: 'text',
    required: false,
    description: '火曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.wed_hours,
    fieldName: 'wed_hours',
    type: 'text',
    required: false,
    description: '水曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.thu_hours,
    fieldName: 'thu_hours',
    type: 'text',
    required: false,
    description: '木曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.fri_hours,
    fieldName: 'fri_hours',
    type: 'text',
    required: false,
    description: '金曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.sat_hours,
    fieldName: 'sat_hours',
    type: 'text',
    required: false,
    description: '土曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.sun_hours,
    fieldName: 'sun_hours',
    type: 'text',
    required: false,
    description: '日曜営業時間',
  },
  {
    ref: TYPEFORM_FIELD_IDS.holiday_hours,
    fieldName: 'holiday_hours',
    type: 'text',
    required: false,
    description: '祝日営業時間',
  },
  // 確認
  {
    ref: TYPEFORM_FIELD_IDS.confirm_checked,
    fieldName: 'confirm_checked',
    type: 'boolean',
    required: false,
    description: '確認チェック',
  },
];

/**
 * カテゴリ選択肢のマッピング
 * Typeformの選択肢ラベル → DBに保存する値
 */
export const CATEGORY_CHOICE_MAP: Record<string, string> = {
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

/**
 * refからフィールドマッピングを取得
 */
export function getFieldByRef(ref: string): TypeformFieldMapping | undefined {
  return TYPEFORM_FIELD_MAPPINGS.find((m) => m.ref === ref);
}

/**
 * fieldNameからフィールドマッピングを取得
 */
export function getFieldByName(fieldName: string): TypeformFieldMapping | undefined {
  return TYPEFORM_FIELD_MAPPINGS.find((m) => m.fieldName === fieldName);
}
