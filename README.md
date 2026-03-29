# Threads Feed & Search Scraper

從 Meta Threads 抓取貼文 — 支援自訂動態、關鍵字搜尋、hashtag 話題三種模式。擷取貼文內容、作者資訊，以及完整互動數據（讚、回覆、轉發、分享）。不需要登入。

## 可以抓到哪些資料？

| 欄位 | 說明 | 範例 |
|------|------|------|
| `postId` | 貼文唯一識別碼 | `DWOlac1D3-Z` |
| `author` | 作者帳號 | `popopo_ki` |
| `content` | 貼文全文 | `東森寵物大里國光店 打烊之後把狗留在...` |
| `publishedAt` | 發佈時間 | `5d` 或 `03/04/26` |
| `likeCount` | 讚數 | `48700` |
| `replyCount` | 回覆數 | `6300` |
| `repostCount` | 轉發數 | `4400` |
| `shareCount` | 分享數 | `20300` |
| `postUrl` | 貼文連結 | `https://www.threads.com/@user/post/...` |
| `sourceType` | 資料來源模式 | `feed`、`search` 或 `tag` |
| `sourceQuery` | 使用的查詢條件 | `寵物醫療` |
| `scrapedAt` | 抓取時間 | `2026-03-29T05:23:28.617Z` |

## 使用方式

1. **選擇抓取模式**（可在同一次執行中組合使用）：

   - **自訂動態（Custom Feed）** — 貼上一個或多個 Threads 自訂 feed 網址
   - **關鍵字搜尋** — 輸入想搜尋的關鍵字
   - **標籤 / 話題** — 輸入 hashtag 來抓取話題頁面

2. **設定限制** — 選擇每個來源最多抓幾篇（`maxPosts`），以及向下捲動幾次載入更多內容（`scrollCount`）。

3. **執行 Actor** — 點「Start」後等待結果。每個來源通常在 60 秒內完成。

4. **匯出資料** — 可下載 JSON、CSV 或 Excel，或透過 API 串接。

### 輸入範例

```json
{
    "feedUrls": ["https://www.threads.com/custom_feed/18113589370710265"],
    "searchKeywords": ["寵物醫療", "pet health"],
    "searchTags": ["#寵物友善", "#petfriendly"],
    "maxPosts": 50,
    "scrollCount": 5
}
```

三個輸入欄位都是選填，但**至少要填一個**。

### 輸出範例

```json
{
    "postId": "DWOlac1D3-Z",
    "author": "popopo_ki",
    "content": "東森寵物大里國光店 打烊之後把狗留在明顯不是裝動物的收納箱裡 狗狗狂叫、一直撞玻璃門，看起來超可憐",
    "publishedAt": "5d",
    "likeCount": 48700,
    "replyCount": 6300,
    "repostCount": 4400,
    "shareCount": 20300,
    "postUrl": "https://www.threads.com/@popopo_ki/post/DWOlac1D3-Z",
    "sourceType": "feed",
    "sourceQuery": "https://www.threads.com/custom_feed/18113589370710265",
    "scrapedAt": "2026-03-29T05:16:47.304Z"
}
```

## 費用大約多少？

本 Actor 使用 Playwright 無頭瀏覽器來渲染 Threads 頁面。參考費用：

| 使用情境 | 貼文數 | 預估費用 |
|----------|------:|-------:|
| 快速搜尋 | 10 | ~$0.05 |
| 單一 feed，50 篇 | 50 | ~$0.10 |
| 5 個關鍵字，各 50 篇 | 250 | ~$0.50 |
| 大批量，10 個來源 | 500 | ~$1.00 |

費用取決於來源數量和捲動深度，每個來源需要一次瀏覽器頁面載入。

## 應用場景

- **社群輿情監控** — 追蹤品牌、競品或產業在 Threads 上的討論
- **趨勢追蹤** — 追蹤 hashtag 的熱度和互動變化
- **內容研究** — 找出你的領域中表現最好的貼文，制定內容策略
- **競品分析** — 分析競爭對手的互動數據和發文模式
- **學術研究** — 收集公開社群媒體資料做研究分析
- **潛在客戶開發** — 發掘你市場中的活躍創作者和社群

## 整合方式

可透過程式取得資料，或串接到現有工作流程：

- **Apify API** — 用任何程式語言取得 JSON 結果
- **Python / JavaScript SDK** — 使用 Apify 客戶端套件
- **Webhooks** — 執行完成時自動通知
- **Zapier / Make / n8n** — 不寫程式也能建立資料管線
- **Google Sheets** — 直接匯出到試算表
- **排程執行** — 設定定時抓取，任意間隔

## 常見問題

### 抓取 Threads 資料合法嗎？

本 Actor 只收集公開可見的資料，不會存取私人帳號、繞過登入牆，也不會收集超出未登入訪客可見範圍的個人資料。請確保你的使用情境符合相關法規及 Meta 服務條款。

### 需要 Threads 帳號嗎？

不需要。本 Actor 完全不需要任何登入或認證，只存取公開頁面。

### 為什麼互動數字是近似值？

Threads 會以縮寫形式顯示大數字（例如「1.7K」、「12.5K」），Actor 會將這些轉換為數值，可能與精確數字略有出入。

### 可以抓留言內容嗎？

目前本 Actor 會擷取每篇貼文的回覆「數量」。抓取完整留言文字需要進入每篇貼文的個別頁面，這個功能已規劃在未來版本中。

### 支援哪些語言？

本 Actor 可處理任何語言的 Threads 內容。互動按鈕標籤目前以英文偵測（Like、Comment、Repost、Share）。

## 技術細節

- **執行環境**：Playwright 無頭瀏覽器（Chromium）
- **同時處理數**：一次一個瀏覽器頁面（遵守 Threads 速率限制）
- **導覽方式**：等待網路閒置 + 可設定的捲動深度
- **擷取策略**：三層 DOM 選擇器策略，針對不同頁面排版提供回退方案
- **錯誤處理**：當找不到貼文時自動儲存除錯截圖

## 更新日誌

- **v0.2** — 新增關鍵字搜尋與 hashtag 標籤抓取模式；新增互動數據（讚、回覆、轉發、分享）；新增 `sourceType` 和 `sourceQuery` 欄位；新增 Apify Console 用的 dataset schema
- **v0.1** — 首次發佈，支援自訂 feed 抓取
