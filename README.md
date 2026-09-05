# Meta Threads 爬蟲 — 用戶主頁貼文批量下載（免登入、免 API）

抓任一 Threads 用戶主頁的貼文：內容、作者、ISO 時間、完整互動數據（讚、回覆、轉發、分享、引用）、媒體網址。批量貼上 100 個帳號都吃得下。**純 HTTP、不用登入、不用 API token、不用養帳號**。每筆結果 **$0.0025**，沒有啟動費。

另外支援**單篇貼文**（讀 Threads 的公開嵌入卡）。

> ⚠️ **自訂 feed 模式暫不可用**——那個要登入才拿得到。搜尋與標籤可以用。
>
> 2026-09 曾一度判定「搜尋也拿不到」而下架該模式，那個判斷是錯的：結果其實就放在搜尋頁的
> 伺服器端 payload 裡，只是 Threads 不給未登入者翻頁的游標。所以**每個關鍵字約 50-70 篇封頂**
> （本 Actor 會把同一個詞用熱門／最新／`#`標籤／標籤頁四種形式各問一次再去重）。要更廣就多給幾個相關詞。
> 這隻爬蟲不會為了繞過它去養帳號，所以那三個模式維持停用，直到 Threads 改回來。

給誰用的：做品牌輿情的、追 KOL 的、寫競品報告的、跑 SaaS 串 Threads 資料的、論文需要資料集的、自己寫 side project 的工程師。

---

## 能抓到什麼

每一篇貼文都會拿到下面這些欄位：

| 欄位 | 說明 | 範例 |
|------|------|------|
| `postId` | 貼文 ID | `DWOlac1D3-Z` |
| `author` | 作者帳號 | `ponbu` |
| `content` | 貼文全文 | `東森寵物大里國光店 打烊之後把狗留在...` |
| `publishedAt` | 發佈時間（原始） | `5d` 或 `03/04/26` |
| `publishedAtISO` | 發佈時間（ISO 8601） | `2026-03-24T05:16:47.304Z` |
| `likeCount` | 讚數 | `48700` |
| `replyCount` | 回覆數 | `6300` |
| `repostCount` | 轉發數 | `4400` |
| `shareCount` | 分享數 | `20300` |
| `viewCount` | 觀看數 | `150000` |
| `quoteCount` | 引用數 | `230` |
| `mediaType` | 媒體類型 | `text`、`photo`、`video`、`carousel` |
| `mediaUrls` | 媒體連結陣列 | `[{ url, type }]` |
| `postUrl` | 貼文網址 | `https://www.threads.com/@user/post/...` |
| `sourceType` | 這筆從哪個模式來的 | `profile`、`tag`、`search`、`post`、`feed` |
| `sourceQuery` | 抓取時用的查詢條件 | `寵物醫療` |
| `scrapedAt` | 抓取當下時間 | `2026-03-29T05:23:28.617Z` |
| `threadParts` | 如果是串文，自動合併每一段 | `[{ postId, content, postUrl, mediaUrls }]` |
| `replies` | 留言（只有 post 模式才有） | `[{ author, content, publishedAt, likeCount }]` |

Dataset 欄位名稱是英文（`username`、`like_count` 那種），方便你下游的程式接。

---

## 模式

**這隻的賣點是「不用登入」。** Threads 的搜尋類爬蟲多半靠登入帳號硬撐，帳號一被封就整批失效——所以那類產品在 Apify Store 上用戶數不低、評分卻普遍偏低。這隻只吃公開拿得到的資料，跑得慢一點，但不會有一天突然全部歸零。

| 模式 | 幹嘛用的 | 要填哪個欄位 |
|------|----------|--------------|
| 👤 **User** | 抓某個用戶的所有貼文 | `usernames[]` |
| 💬 **Post** | 單篇貼文（不含留言，見下方注意事項） | `postUrls[]` |
| 🏷️ **Hashtag** | 標籤 / 話題（每個詞約 50-70 篇）| `keywords[]` |
| 🔎 **Search** | 關鍵字搜尋（每個詞約 50-70 篇）| `keywords[]` |
| 📰 ~~Feed~~ | *暫不可用 — 需要登入* | — |

一次跑一個 mode，從 Apify Console 的下拉選單選就好。

---

## 輸入欄位

| 欄位 | 型別 | 必填 | 預設 | 說明 |
|------|------|:----:|:----:|------|
| `mode` | enum | 建議填 | `user` | `user` / `hashtag` / `search` / `post` / `feed` 擇一。不填的話會自動偵測你填了什麼欄位。 |
| `usernames` | string[] | `user` 模式必填 | — | 純帳號，不用加 `@` 也不用貼整串網址。單次最多 **100** 個。 |
| `bulkUsernames` | string | 選填 | — | 貼上一整欄 Google Sheet / Excel 的帳號（一行一個），會自動併進 `usernames`。適合懶人模式。 |
| `keywords` | string[] | `hashtag` / `search` 必填 | — | 關鍵字或 hashtag（開頭 `#` 可有可無）。單次最多 **100** 個。 |
| `bulkKeywords` | string | 選填 | — | 同上，一行一個關鍵字貼上去就好。 |
| `postUrls` | string[] | `post` 模式必填 | — | Threads 貼文完整網址，留言會一起抓。 |
| `feedUrls` | string[] | `feed` 模式必填 | — | Threads 自訂 feed 網址。 |
| `searchSort` | enum | 選填 | `top` | `top`（熱門）或 `recent`（最新），只對 `search` 模式有效。 |
| `dateFrom` | string | 選填 | — | `YYYY-MM-DD` **或**相對日期：`7 days`、`1 month`、`2 weeks`、`1 year`。 |
| `dateTo` | string | 選填 | — | 同 `dateFrom` 格式。 |
| `maxPosts` | integer | 選填 | `50` | 每個來源最多抓幾篇（1-500）。捲動次數會自動算，你不用管。 |

---

## 範例

**👤 抓一批 Threads 紅人**

```json
{
  "mode": "user",
  "usernames": ["ponbu", "zuck", "mosseri"],
  "maxPosts": 50
}
```

**🏷️ 追一個月內的 `#寵物友善` 話題**

```json
{
  "mode": "hashtag",
  "keywords": ["#寵物友善"],
  "dateFrom": "1 month",
  "maxPosts": 200
}
```

**🔎 過去 7 天講「台積電」的最新貼文**

```json
{
  "mode": "search",
  "keywords": ["台積電", "護國神山"],
  "searchSort": "recent",
  "dateFrom": "7 days",
  "maxPosts": 100
}
```

**💬 單篇爆文 + 留言**

```json
{
  "mode": "post",
  "postUrls": ["https://www.threads.com/@ponbu/post/DWOlac1D3-Z"]
}
```

**📋 懶人模式：一次貼 80 個 KOL 帳號**

直接把 Google Sheet / Excel 那一整欄 Ctrl+C → 貼到 `bulkUsernames` 就好，不用一個一個點「新增」。

**Console 表單的填法：一行一個，按 Enter 換行，不要加引號、不要用逗號。** 長這樣：

```
ponbu
zuck
mosseri
threadsapp
taylornikolai
```

如果是走 API 呼叫（不是 Console 表單），`bulkUsernames` 是一個字串，裡面用 `\n` 換行：

```json
{
  "mode": "user",
  "bulkUsernames": "ponbu\nzuck\nmosseri\nthreadsapp\ntaylornikolai",
  "maxPosts": 20
}
```

---

## 幾個要注意的地方

- **`maxPosts` 是上限不是保證**。如果那個帳號本來就沒幾篇、或那個 hashtag 很冷，抓出來就會少於你設的數字。爬蟲連續 5 次捲不到新東西就會自己停，不會傻傻跑整場。
- **相對日期是執行當下算的**。`"7 days"` 今天跑跟明天跑會得到不同的 `dateFrom`，這對排程任務很好用（每天抓「最近一週」就設一次、永遠對）。
- **互動數的精度依模式而不同。** `user` 模式拿得到精確值（讚 1435 就是 1435）。`post` 模式讀的是公開嵌入卡，卡片本身把大數字寫成 `1.4K`，爬蟲換算成 `1400`——**超過 999 就是近似值**，1000 以下才精確。需要精確數字請用 `user` 模式抓該作者的主頁。
- **`post` 模式不含留言。** 舊版靠讀網頁 DOM 取留言，2026-09 之後 Threads 對未登入者不再渲染那個頁面，嵌入卡也只有單篇貼文。這是真的功能損失，不是設定問題。
- **`post` 模式抓串文中的貼文時**，會回傳你指定的那一篇，前面的脈絡放在 `threadParts[]`。
- **串文會自動合併**。那種「1/」、「2/」一路接下去的多段貼文會被併成同一筆，每段變成 `threadParts[]` 裡的元素，你不會看到 7 段同主題被當成 7 筆個別貼文。
- **不用登入 = 只抓得到公開內容**。鎖帳號的、需要追蹤才能看的貼文，這隻看不到，請不要 Issue 說為什麼抓不到你前男友的限動。

---

## 常見問題

**Q: 帳號要加 `@` 嗎？要貼整串網址嗎？**
都不用。直接 `ponbu` 就好。有加 `@` 會自動去掉，貼舊版 `profileUrls` 整串網址的舊用戶也會自動遷移，現有 schedule 不會爛掉。

**Q: 我設 `maxPosts: 100` 但只抓到 60 篇，是不是壞了？**
八成不是，是那個來源本來就沒那麼多可見貼文。看 run log 裡的 `totalItems` 和 `in date range` 的數字就知道爬蟲是不是有正常工作。如果你 search 的是熱門詞但每次都只回 20 篇以下，再來開 Issue。

**Q: 為什麼有些欄位是 `null` 或 `0`？**
Threads 自己就沒給。觀看數（`viewCount`）特別明顯，只有公開且互動夠高的帳號才會顯示；引用數（`quoteCount`）也會依貼文類型時有時無。這是資料缺失不是 silent failure，該有的欄位都會出現，只是值是空的。

**Q: `dateFrom` / `dateTo` 對每個 mode 都有效嗎？**
技術上每個 mode 都會套日期過濾，但只有 `search`、`hashtag`、`user` 三個模式有意義。`post` 模式你給的是確定的網址，不會被日期篩掉。`feed` 模式會篩，但取決於那個 feed 本身怎麼排序。

**Q: 可以匯出哪些格式？**
JSON、CSV、Excel、XML、HTML table — Apify dataset 標準的幾種都有，可以從 Console 下載，或接 Apify API / Python / JavaScript SDK。串 Zapier、Make、n8n、Google Sheets 也都行。

---

## 跟官方 Threads API 的差別

Meta 有出[官方 Threads API](https://developers.facebook.com/docs/threads)，但限制很硬：

- 只能讀**你自己的帳號**或**授權給你的帳號**的資料 — 想追競品、追 KOL、追公眾話題？官方 API 一律不給。
- 要跑 OAuth、要申請 Facebook Developer 帳號、發布類應用還要過審。
- Rate limit 跟端點覆蓋度比「一個沒登入的瀏覽器看得到的東西」還窄。

如果你的用途是公開資料分析（輿情、趨勢、競品、社群研究），走 scraper 快很多。如果你是要發文 / 管理自己帳號 / 跑自動化回覆，那就乖乖用官方 API。

---

## 免責聲明

本爬蟲只收集**公開可見**的 Threads 資料，不會存取私人帳號、不會繞過登入牆、不會蒐集一個沒登入的訪客看不到的個人資料。用途記得自己評估是否符合當地法規（GDPR、CCPA、個資法）跟 Meta 的服務條款。拿去做正經研究、品牌監控、學術分析都 OK，拿去做騷擾、垃圾訊息、未授權資料轉售就別鬧了。

---

*Threads 爬蟲 · Meta Threads 資料抓取 · Threads 貼文擷取 · Threads 用戶主頁 · Threads 免登入爬蟲 · Threads 批量下載 · 品牌監控 · 競品分析 · KOL 追蹤 · 社群聆聽 · 網紅行銷數據 · 台灣 Threads · Threads API 替代方案*
