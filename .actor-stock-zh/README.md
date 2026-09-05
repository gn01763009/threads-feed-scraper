# 台股 Threads 輿情爬蟲

> 個股情緒、熱門話題、繁中量化研究專用 — 用 Threads 公開資料補你的 sentiment pipeline

---

## 🎯 適合誰

| 角色 | 怎麼用 |
|---|---|
| **量化交易員 / 私募基金** | 個股 sentiment alpha 訊號、輿情突發事件偵測 |
| **券商研究員** | 個股報告補 fundamental 之外的 social signal |
| **AI 投顧 / fintech startup** | 訓練繁中 sentiment / topic-modeling 的 input |
| **財經 KOL / YouTuber** | 找熱門股、預判 trending topic、選題 |
| **PR / IR** | 監控自家上市公司被討論、危機預警 |
| **新聞媒體財經線** | 新聞前哨、市場熱度指標 |

---

## 💡 三個典型 use case

### 1. 個股輿情每日掃

每天早盤前抓「台積電、鴻海、聯發科、輝達、台達電」過去 24 小時所有貼文 + 互動數據，丟進你的 sentiment dashboard。

```json
{
  "mode": "search",
  "keywords": ["台積電", "鴻海", "聯發科", "輝達", "台達電"],
  "dateFrom": "1 day",
  "searchSort": "top",
  "maxItemsPerSource": 200
}
```

排程設成每天 08:30 跑一次、結果 webhook 到你的 BI 工具。

### 2. 突發事件深 dig

某檔個股突然爆量，需要 dig 進前 10 篇熱門貼文的留言區看反方論述。

```json
{
  "mode": "post",
  "postUrls": [
    "https://www.threads.com/@some_user/post/Cxxxxxx",
    "https://www.threads.com/@another_user/post/Cyyyyyy"
  ],
  "includeReplies": true
}
```

### 3. 季度法說熱度監測

抓 Q4 法說會前後 3 天「台積電 法說」、「聯發科 法說」等關鍵字，比對歷史 baseline。

```json
{
  "mode": "search",
  "keywords": ["台積電", "聯發科", "鴻海"],
  "dateFrom": "2026-01-13",
  "dateTo": "2026-01-19",
  "searchSort": "top"
}
```

---

## 📊 抓什麼資料

### 每篇貼文

- `postId`、`postUrl`、`content`、`publishedAt`、**`publishedAtISO`** ← 直接 import pandas / SQL
- `mediaType` (`text` / `photo` / `video` / `carousel`) + `mediaUrls[]`
- 互動數據：`likeCount`、`replyCount`、`repostCount`、`shareCount`、`quoteCount`
- `author`（發文者帳號）、`sourceType`（哪個模式抓的）、`sourceQuery`（哪個 ticker / 帳號）
- `scrapedAt` 時間戳
- `threadParts[]` — 多段 thread 自動 merge 成單筆 record

### 拿不到的東西（先講清楚，省得你排進 pipeline 才發現）

- **`viewCount` 一律是 `0`。** Threads 不對未登入者送觀看數，所以這個欄位存在但沒有值——不是抓失敗。
- **沒有留言內容。** `replyCount`（留言則數）有，但留言本身沒有：Threads 2026-09 之後不再對未登入者渲染貼文頁，嵌入卡也只有單篇。
- **作者只有帳號名。** 沒有 `displayName` / `bio` / `followerCount` / `verified`——那些要登入才拿得到。
- **每個關鍵字約 50-70 篇封頂。** Threads 只對未登入者送搜尋結果的第一頁、而且把翻頁游標清空，所以沒有「一個詞抓五百篇」這回事。本 Actor 的做法是把同一個詞用四種形式問（熱門、最新、`#` 標籤、標籤頁），結果幾乎不重疊、合併去重後約 50-70 篇。**要更廣就多給幾個相關詞**（`台積電`、`2330`、`台積`），不要期待單一關鍵字給你無限深度。

---

## ⚙️ 四種模式

| 模式 | 用途 | 主要欄位 |
|---|---|---|
| **🔎 關鍵字搜尋**（預設）| 個股 / 主題輿情 — 量化常用 | `keywords[]` + 日期範圍 |
| 🏷️ 標籤 / 話題 | `#AI概念股`、`#半導體` 等 hashtag | `keywords[]`（含 #） |
| 👤 用戶主頁 | KOL / 分析師抓貼文 | `usernames[]` |
| 💬 單篇貼文 | 突發事件單篇深入（不含留言，見上方）| `postUrls[]` |
| 📰 ~~自訂動態 feed~~ | *暫不可用 — 需要登入才拿得到* | — |

---

## 💰 為什麼是繁中市場最便宜的 sentiment data source

| 服務 | 月費 / 單筆價 | 涵蓋繁中 Threads？ |
|---|---|---|
| Bloomberg Terminal | $2,000+/mo | ❌ |
| RavenPack | $1,000+/mo | ⚠️ 有限 |
| StockTwits API | $500/mo（美股 only）| ❌ |
| **這個 Actor** | **$0.005 / 筆**（每月 1000 筆 = $5） | ✅ 原生 |

---

## 🔧 排程整合

支援相對日期 `7 days`、`1 month`、`2 weeks` — 在 n8n / Zapier / Make / Apify Schedules 排日 / 週 / 月 cron 都不用每次改參數。

---

## 🧪 跟 generic Threads scraper 的差異

這個 actor 跟 [`threads-feed-scraper`](https://apify.com/claude_code_reviewer/threads-feed-scraper) **共用同一份 Docker image**，差異在 **預設配置 + 文件對 fintech 用法做了優化**：

- 預設模式從 `user` 改成 `search`（多數 fintech use case 是 search）
- 預設 prefill：`["台積電", "輝達", "聯發科", "#AI概念股"]`（一打開就 get use case）
- README 寫法以個股輿情為主軸

如果你的 use case 不是 fintech、用一般版本即可。

---

## 🤝 Support

有 bug / feature request：[GitHub issue](https://github.com/gn01763009/threads-feed-scraper/issues)
