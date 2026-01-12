/**
 * Typeform 質問ID → 項目名マッピング設定
 * 
 * 🔴 手動設定が必要:
 * 1) Typeformでフォームを作成
 * 2) 各質問のQuestion IDを確認（Typeformの設定画面 → Logic → 各質問のRef ID）
 * 3) 以下のマッピングを実際のQuestion IDに更新
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
 * 🔴 重要: 以下のrefを実際のTypeformの質問Reference IDに置き換えてください
 * 
 * Typeformでの設定方法:
 * 1. フォーム編集画面を開く
 * 2. 各質問をクリック → 右サイドバー → Settings → Question Reference
 * 3. 「ref」欄に表示されている値をコピー
 */
export const TYPEFORM_FIELD_MAPPINGS: TypeformFieldMapping[] = [
  {
    ref: 'facility_name',         // ← 実際のTypeform ref IDに変更
    fieldName: 'facility_name',
    type: 'text',
    required: true,
    description: '店舗/施設名',
  },
  {
    ref: 'contact_email',         // ← 実際のTypeform ref IDに変更
    fieldName: 'contact_email',
    type: 'email',
    required: true,
    description: '連絡先メールアドレス',
  },
  {
    ref: 'price_min',             // ← 実際のTypeform ref IDに変更
    fieldName: 'price_min_yen',
    type: 'number',
    required: false,
    description: '価格レンジ下限（円）',
  },
  {
    ref: 'price_max',             // ← 実際のTypeform ref IDに変更
    fieldName: 'price_max_yen',
    type: 'number',
    required: false,
    description: '価格レンジ上限（円）',
  },
  {
    ref: 'category',              // ← 実際のTypeform ref IDに変更
    fieldName: 'category',
    type: 'choice',
    required: false,
    description: 'カテゴリ（restaurant/beauty/clinic/other）',
  },
  {
    ref: 'address',               // ← 実際のTypeform ref IDに変更
    fieldName: 'address',
    type: 'text',
    required: false,
    description: '住所',
  },
  {
    ref: 'hours_all_same',        // ← 実際のTypeform ref IDに変更
    fieldName: 'hours_all_same',
    type: 'boolean',
    required: true,
    description: '営業時間は全曜日共通ですか？（質問8番）',
  },
  // 共通時間帯（hours_all_same = true の場合）
  {
    ref: 'hours_common_start',    // ← 実際のTypeform ref IDに変更
    fieldName: 'hours_common_start',
    type: 'text',
    required: false,
    description: '共通開始時刻（HH:MM）',
  },
  {
    ref: 'hours_common_end',      // ← 実際のTypeform ref IDに変更
    fieldName: 'hours_common_end',
    type: 'text',
    required: false,
    description: '共通終了時刻（HH:MM）',
  },
  // 曜日別時間帯（hours_all_same = false の場合）
  // 月曜
  {
    ref: 'hours_mon_start',       // ← 実際のTypeform ref IDに変更
    fieldName: 'hours_mon_start',
    type: 'text',
    required: false,
    description: '月曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_mon_end',         // ← 実際のTypeform ref IDに変更
    fieldName: 'hours_mon_end',
    type: 'text',
    required: false,
    description: '月曜終了時刻（HH:MM）',
  },
  // 火曜
  {
    ref: 'hours_tue_start',
    fieldName: 'hours_tue_start',
    type: 'text',
    required: false,
    description: '火曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_tue_end',
    fieldName: 'hours_tue_end',
    type: 'text',
    required: false,
    description: '火曜終了時刻（HH:MM）',
  },
  // 水曜
  {
    ref: 'hours_wed_start',
    fieldName: 'hours_wed_start',
    type: 'text',
    required: false,
    description: '水曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_wed_end',
    fieldName: 'hours_wed_end',
    type: 'text',
    required: false,
    description: '水曜終了時刻（HH:MM）',
  },
  // 木曜
  {
    ref: 'hours_thu_start',
    fieldName: 'hours_thu_start',
    type: 'text',
    required: false,
    description: '木曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_thu_end',
    fieldName: 'hours_thu_end',
    type: 'text',
    required: false,
    description: '木曜終了時刻（HH:MM）',
  },
  // 金曜
  {
    ref: 'hours_fri_start',
    fieldName: 'hours_fri_start',
    type: 'text',
    required: false,
    description: '金曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_fri_end',
    fieldName: 'hours_fri_end',
    type: 'text',
    required: false,
    description: '金曜終了時刻（HH:MM）',
  },
  // 土曜
  {
    ref: 'hours_sat_start',
    fieldName: 'hours_sat_start',
    type: 'text',
    required: false,
    description: '土曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_sat_end',
    fieldName: 'hours_sat_end',
    type: 'text',
    required: false,
    description: '土曜終了時刻（HH:MM）',
  },
  // 日曜
  {
    ref: 'hours_sun_start',
    fieldName: 'hours_sun_start',
    type: 'text',
    required: false,
    description: '日曜開始時刻（HH:MM）',
  },
  {
    ref: 'hours_sun_end',
    fieldName: 'hours_sun_end',
    type: 'text',
    required: false,
    description: '日曜終了時刻（HH:MM）',
  },
  // 祝日
  {
    ref: 'hours_holiday_start',
    fieldName: 'hours_holiday_start',
    type: 'text',
    required: false,
    description: '祝日開始時刻（HH:MM）',
  },
  {
    ref: 'hours_holiday_end',
    fieldName: 'hours_holiday_end',
    type: 'text',
    required: false,
    description: '祝日終了時刻（HH:MM）',
  },
  // 写真URL（1〜5）
  {
    ref: 'photo_url_1',
    fieldName: 'photo_url_1',
    type: 'url',
    required: false,
    description: '写真URL 1',
  },
  {
    ref: 'photo_url_2',
    fieldName: 'photo_url_2',
    type: 'url',
    required: false,
    description: '写真URL 2',
  },
  {
    ref: 'photo_url_3',
    fieldName: 'photo_url_3',
    type: 'url',
    required: false,
    description: '写真URL 3',
  },
  {
    ref: 'photo_url_4',
    fieldName: 'photo_url_4',
    type: 'url',
    required: false,
    description: '写真URL 4',
  },
  {
    ref: 'photo_url_5',
    fieldName: 'photo_url_5',
    type: 'url',
    required: false,
    description: '写真URL 5',
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
