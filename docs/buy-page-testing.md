# 購入ページ (Buy) 検証手順

## 概要

`/buy` ページは `facilityId` / `store` / `facility` のいずれかのURLパラメータで店舗IDを受け取り、
`facilities` テーブル → `stores` テーブルの順にフォールバックしてデータを取得します。

## 対応するURLパラメータ（優先順）

1. `facilityId` — 新規オンボード施設用（UUID）
2. `store` — 既存店舗互換（TEXT ID）
3. `facility` — 既存店舗互換（TEXT ID）

## 検証URL例

### 新規 facilities テーブルの施設

```
https://sugukuru-2.pages.dev/buy?facilityId=<UUID>
```

例:
```
https://sugukuru-2.pages.dev/buy?facilityId=18c59bc7-3249-4248-874c-6c1dbbb7953d
```

### 既存 stores テーブルの店舗

```
https://sugukuru-2.pages.dev/buy?store=ramen-a
https://sugukuru-2.pages.dev/buy?facility=cafe-shibuya
```

## 確認項目

- [ ] URLパラメータに `facilityId` を指定した場合、施設名・説明が正しく表示される
- [ ] URLパラメータに `store` を指定した場合、既存店舗が正しく表示される
- [ ] URLパラメータに `facility` を指定した場合、既存店舗が正しく表示される
- [ ] IDが存在しない場合、「店舗が見つかりません」エラーが表示される
- [ ] IDが指定されていない場合、「店舗が選択されていません」エラーが表示される
- [ ] 価格表示が正しく動作する（ダイナミック価格 or fastpass_price）
- [ ] 営業時間外判定（get_facility_status RPC）が動作する

## 開発時のデバッグログ

開発環境（`import.meta.env.MODE !== 'production'`）では、コンソールに以下のログが出力されます：

```
[Buy] Fetching store data for ID: <ID>
[Buy] Found in facilities: {...}  // または
[Buy] Not found in facilities, trying stores...
[Buy] Found in stores: {...}
```
