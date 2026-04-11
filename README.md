# Threads 全方位爬蟲 — 搜尋、貼文、用戶、留言、動態一次搞定

從 Meta Threads 抓取貼文 — 支援自訂動態、關鍵字搜尋、hashtag 話題、用戶頁面、單篇貼文五種模式。擷取貼文內容、作者資訊、媒體連結、留言回覆，以及完整互動數據（讚、回覆、轉發、分享、觀看、引用）。不需要登入。

## 為什麼選這個爬蟲？

大多數 Threads 爬蟲只做一件事：抓貼文、或抓用戶、或抓搜尋結果。這個 Actor **五種模式全包**，一次執行就搞定：

| 模式 | 功能 | 其他爬蟲 |
|------|------|----------|
| **關鍵字搜尋** | 依關鍵字搜尋 Threads，可排序 | 部分有 |
| **標籤 / 話題** | 抓取 hashtag 話題頁面 | 部分有 |
| **用戶頁面** | 抓取某用戶所有貼文 | 部分有 |
| **單篇貼文 + 留言** | 抓取貼文及其回覆串 | 少見 |
| **自訂動態** | 抓取 Threads 自訂 feed 網址 | 獨家 |

一個 Actor，一次執行，五種模式任意組合。不需要串接多個爬蟲。

## 可以抓到哪些資料？

| 欄位 | 說明 | 範例 |
|------|------|------|
| `postId` | 貼文唯一識別碼 | `DWOlac1D3-Z` |
| `author` | 作者帳號 | `popopo_ki` |
| `content` | 貼文全文 | `東森寵物大里國光店 打烊之後把狗留在...` |
| `publishedAt` | 發佈時間（原始格式） | `5d` 或 `03/04/26` |
| `publishedAtISO` | 發佈時間（ISO 8601） | `2026-03-24T05:16:47.304Z` |
| `likeCount` | 讚數 | `48700` |
| `replyCount` | 回覆數 | `6300` |
| `repostCount` | 轉發數 | `4400` |
| `shareCount` | 分享數 | `20300` |
| `viewCount` | 觀看數 | `150000` |
| `quoteCount` | 引用數 | `230` |
| `mediaType` | 媒體類型 | `text`、`photo`、`video`、`carousel` |
| `mediaUrls` | 媒體連結 | `[{ url: "...", type: "image" }]` |
| `postUrl` | 貼文連結 | `https://www.threads.com/@user/post/...` |
| `sourceType` | 資料來源模式 | `feed`、`search`、`tag`、`profile`、`post` |
| `sourceQuery` | 使用的查詢條件 | `寵物醫療` |
| `scrapedAt` | 抓取時間 | `2026-03-29T05:23:28.617Z` |
| `replies` | 留言回覆（僅 post 模式） | `[{ author, content, publishedAt, likeCount }]` |

## 使用方式

1. **選擇抓取模式**（可在同一次執行中組合使用）：

   - **關鍵字搜尋** — 輸入想搜尋的關鍵字，可選擇排序方式（熱門 / 最新）
   - **標籤 / 話題** — 輸入 hashtag 來抓取話題頁面
   - **用戶頁面** — 貼上用戶 profile 網址，抓取該用戶的貼文
   - **單篇貼文** — 貼上貼文網址，抓取該篇貼文及其留言回覆
   - **自訂動態** — 貼上 Threads 自訂 feed 網址

2. **設定限制** — 選擇每個來源最多抓幾篇（`maxPosts`），以及向下捲動幾次載入更多內容（`scrollCount`）。

3. **日期篩選**（選填） — 設定 `dateFrom` 和 `dateTo` 來篩選特定日期範圍內的貼文。

4. **執行 Actor** — 點「Start」後等待結果。每個來源通常在 60 秒內完成。

5. **匯出資料** — 可下載 JSON、CSV 或 Excel，或透過 API 串接。

### 輸入參數

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|------|------|:----:|:------:|------|
| `feedUrls` | string[] | 否 | - | Threads 自訂 feed 網址 |
| `searchKeywords` | string[] | 否 | - | 搜尋關鍵字 |
| `searchTags` | string[] | 否 | - | Hashtag / 話題（開頭 `#` 可省略） |
| `profileUrls` | string[] | 否 | - | 用戶 profile 網址（如 `https://www.threads.com/@zuck`） |
| `postUrls` | string[] | 否 | - | 單篇貼文網址（會同時抓取留言） |
| `maxPosts` | integer | 否 | 50 | 每個來源最多抓取貼文數（1-200） |
| `scrollCount` | integer | 否 | 5 | 捲動次數（1-20） |
| `searchSort` | string | 否 | `top` | 搜尋排序：`top`（熱門）或 `recent`（最新） |
| `dateFrom` | string | 否 | - | 篩選起始日期（YYYY-MM-DD） |
| `dateTo` | string | 否 | - | 篩選結束日期（YYYY-MM-DD） |

以上來源參數都是選填，但**至少要填一個**。

### 輸入範例

```json
{
    "feedUrls": ["https://www.threads.com/custom_feed/18113589370710265"],
    "searchKeywords": ["寵物醫療", "pet health"],
    "searchTags": ["#寵物友善", "#petfriendly"],
    "profileUrls": ["https://www.threads.com/@zuck"],
    "postUrls": ["https://www.threads.com/@user/post/ABC123"],
    "maxPosts": 50,
    "scrollCount": 5,
    "searchSort": "recent",
    "dateFrom": "2026-03-01",
    "dateTo": "2026-03-29"
}
```

### 輸出範例

```json
{
    "postId": "DWOlac1D3-Z",
    "author": "popopo_ki",
    "content": "東森寵物大里國光店 打烊之後把狗留在明顯不是裝動物的收納箱裡 狗狗狂叫、一直撞玻璃門，看起來超可憐",
    "publishedAt": "5d",
    "publishedAtISO": "2026-03-24T05:16:47.304Z",
    "likeCount": 48700,
    "replyCount": 6300,
    "repostCount": 4400,
    "shareCount": 20300,
    "viewCount": 150000,
    "quoteCount": 230,
    "mediaType": "photo",
    "mediaUrls": [
        { "url": "https://scontent.cdninstagram.com/...", "type": "image" }
    ],
    "postUrl": "https://www.threads.com/@popopo_ki/post/DWOlac1D3-Z",
    "sourceType": "feed",
    "sourceQuery": "https://www.threads.com/custom_feed/18113589370710265",
    "scrapedAt": "2026-03-29T05:16:47.304Z",
    "replies": []
}
```

單篇貼文模式的 `replies` 欄位會包含留言：

```json
{
    "replies": [
        {
            "author": "user123",
            "content": "太扯了吧！",
            "publishedAt": "2d",
            "likeCount": 340
        }
    ]
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
- **KOL 監控** — 追蹤特定用戶的發文內容和互動趨勢
- **留言分析** — 深入分析特定貼文的留言回覆情緒和趨勢
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

可以！使用 `postUrls` 輸入單篇貼文網址，Actor 會自動抓取該篇貼文的留言回覆（每篇最多 20 則）。留言資料包含作者、內容、時間和讚數。

### 可以只抓最新的貼文嗎？

可以。使用 `searchSort: "recent"` 來按最新排序搜尋結果，或搭配 `dateFrom` / `dateTo` 篩選特定日期範圍的貼文。

### 支援哪些語言？

本 Actor 可處理任何語言的 Threads 內容。互動按鈕標籤目前以英文偵測（Like、Comment、Repost、Share）。

## 技術細節

- **執行環境**：Playwright 無頭瀏覽器（Chromium）
- **同時處理數**：一次一個瀏覽器頁面（遵守 Threads 速率限制）
- **導覽方式**：等待網路閒置 + 可設定的捲動深度
- **擷取策略**：三層 DOM 選擇器策略，針對不同頁面排版提供回退方案
- **時間標準化**：自動將 Threads 的相對時間（如「5d」）和日期轉換為 ISO 8601 格式
- **媒體偵測**：自動辨識貼文媒體類型（純文字、圖片、影片、輪播）
- **錯誤處理**：當找不到貼文時自動儲存除錯截圖

## 更新日誌

- **v0.3** — 新增用戶頁面抓取、單篇貼文 + 留言抓取、媒體連結與類型擷取、時間標準化、搜尋排序、日期範圍篩選、觀看數和引用數、使用分析
- **v0.2** — 新增關鍵字搜尋與 hashtag 標籤抓取模式；新增互動數據；新增 dataset schema
- **v0.1** — 首次發佈，支援自訂 feed 抓取
