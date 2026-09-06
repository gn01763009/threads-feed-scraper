# Threads Scraper: The All-in-One Data Engine for Meta Threads

Unlock deep market insights with a unified scraper. No login, no tokens, and no official API restrictions.

---

## 🔥 Why This Scraper?

- Zero Authentication: Skip the OAuth setup and Facebook Developer accounts. No login or API tokens required.
- Unified Actor: 5 modes in one codebase. Simplify your tech stack and reduce integration maintenance.
- Massive Scalability: Bulk-paste up to 100 usernames or keywords. Perfect for tracking large KOL lists.
- Workflow-Ready: Built-in support for relative dates (e.g., "7 days") makes it easy to schedule recurring runs in n8n, Zapier, or Make.
- Clean, Merged Data: Multi-segment thread posts are automatically stitched into a single record (threadParts[]) for better readability.
- Cost-Efficient: Flat $0.005 per result with no start fees and smart auto-stop to prevent wasted credits.

---

## What this scraper extracts

For every post:

- `postId`, `postUrl`, `content`, `publishedAt`, `publishedAtISO`
- `mediaType` (`text` / `photo` / `video` / `carousel`) and `mediaUrls[]`
- Engagement: `likeCount`, `replyCount`, `repostCount`, `shareCount`, `quoteCount`
  (`viewCount` is present in the output but always `0` — Threads does not serve view counts to logged-out clients)
- `sourceType` (which mode produced it) and `sourceQuery` (the exact username / keyword / URL)
- `scrapedAt` timestamp
- `threadParts[]` — multi-segment thread posts are merged automatically, each segment preserved

For the author:

- `author` handle

For replies (only in `post` mode):

- `replies[]` — up to 20 top replies with `author`, `content`, `publishedAt`, `likeCount`

Dataset field keys are English across every locale — downstream tooling stays portable.

---

## Five modes, one actor

| Mode | What it does | Input field |
|------|--------------|-------------|
| 👤 **User** | Scrape all posts from a user's profile | `usernames[]` |
| 🏷️ **Hashtag** | Scrape a hashtag / topic page | `keywords[]` |
| 🔎 **Search** | Keyword search with Top / Recent sort | `keywords[]` + `searchSort` |
| 💬 **Post** | Single post with up to 20 top replies | `postUrls[]` |
| 📰 **Feed** | Any Threads custom feed URL | `feedUrls[]` |

Pick one mode per run from the **Mode** dropdown. Competing scrapers split these into 4–5 separate actors — this one keeps them in a single codebase so your integration stays simple.

---

## Inputs

| Field | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| `mode` | enum | recommended | `user` | One of `user`, `hashtag`, `search`, `post`, `feed`. If omitted, auto-detected from whichever field you fill. |
| `usernames` | string[] | for `user` mode | — | Plain usernames, no `@`, no URL. Batch up to **100**. |
| `bulkUsernames` | string | optional | — | Textarea — paste one username per line (copy a spreadsheet column straight in). Merged into `usernames`. |
| `keywords` | string[] | for `hashtag` / `search` | — | Keywords or hashtags (leading `#` optional). Batch up to **100**. |
| `bulkKeywords` | string | optional | — | Textarea paste for keywords. Merged into `keywords`. |
| `postUrls` | string[] | for `post` mode | — | Full Threads post URLs — replies are scraped automatically. |
| `feedUrls` | string[] | for `feed` mode | — | Threads custom feed URLs. |
| `searchSort` | enum | optional | `top` | `top` or `recent`. Only applies to `search` mode. |
| `dateFrom` | string | optional | — | `YYYY-MM-DD` **or** relative: `7 days`, `1 month`, `2 weeks`, `1 year`. |
| `dateTo` | string | optional | — | Same format as `dateFrom`. |
| `maxPosts` | integer | optional | `50` | Max posts per source, 1–500. Scrolling is auto-managed — no knob to tune. |

---

## Usage examples

**👤 Scrape three user profiles**

```json
{
  "mode": "user",
  "usernames": ["zuck", "mosseri", "finkd"],
  "maxPosts": 50
}
```

**🏷️ Scrape a hashtag across the last month**

```json
{
  "mode": "hashtag",
  "keywords": ["#AINews"],
  "dateFrom": "1 month",
  "maxPosts": 200
}
```

**🔎 Keyword search, most recent posts from the last 7 days**

```json
{
  "mode": "search",
  "keywords": ["LLM agents", "vibe coding"],
  "searchSort": "recent",
  "dateFrom": "7 days",
  "maxPosts": 100
}
```

**💬 Single post + top replies**

```json
{
  "mode": "post",
  "postUrls": ["https://www.threads.com/@zuck/post/ABC123"]
}
```

**📋 Bulk paste — 80 KOL accounts from a spreadsheet**

Copy a column straight from Google Sheets / Excel and paste into `bulkUsernames` — no clicking "Add" 80 times.

**Console form format: one username per line, press Enter between each — no quotes, no commas.** Like this:

```
zuck
mosseri
finkd
threadsapp
taylornikolai
```

If you're calling the API instead of using the Console, `bulkUsernames` is a single string with `\n` as the line separator:

```json
{
  "mode": "user",
  "bulkUsernames": "zuck\nmosseri\nfinkd\nthreadsapp\ntaylornikolai",
  "maxPosts": 20
}
```

---

## Notes and caveats

- **`maxPosts` is a ceiling, not a guarantee.** Inactive profiles or niche hashtags may return fewer posts. The scraper stops early after 5 consecutive stale scrolls instead of burning time.
- **Relative dates are evaluated at run time.** `"7 days"` today and tomorrow produce different absolute dates — useful for scheduled runs that always fetch "the past week".
- **Engagement counts can be approximations.** Threads abbreviates large numbers (e.g. `12.5K`) — the actor normalizes these to integers, so `12500` is the converted value, not an exact count.
- **Replies are only scraped in `post` mode**, limited to the first ~20 top-level replies per post.
- **No login = public data only.** Private accounts and follower-only content are not accessible.
- **Thread chains are merged automatically.** Multi-segment posts (`1/`, `2/`, `3/`) are combined into a single record via `threadParts[]` instead of being stored as separate rows.

---

## FAQ

**Q: How do I pass usernames? With `@` or without, full URL or plain?**
Plain is canonical: `zuck`, not `@zuck` or `https://www.threads.com/@zuck`. Leading `@` is stripped automatically, and the legacy `profileUrls` field from v0.3 is auto-migrated — existing API integrations won't break.

**Q: I got a partial result — fewer posts than `maxPosts`. Why?**
Either the profile genuinely has fewer posts, the hashtag is niche, or Threads' feed stopped yielding new items after repeated scrolls. Check `totalItems` in the run log — that's the true count.

**Q: Some fields are `null` or `0`. Bug?**
**`viewCount` is always `0`, regardless of account size.** Threads does not serve view counts to logged-out visitors, and running logged-out is exactly how this scraper works — so that field never carries a value. `quoteCount` genuinely varies by post type. Neither is a silent failure: the fields are always present, just empty.

**Q: Does `dateFrom` / `dateTo` apply to `user` and `post` modes?**
Date filtering runs on every mode, but it only matters for `search`, `hashtag`, `user`, and `feed` — `post` mode scrapes specific known URLs regardless of date. Relative expressions like `"1 month"` are resolved to absolute `YYYY-MM-DD` before filtering.

**Q: What output formats are supported?**
JSON, CSV, Excel, XML, HTML table — standard Apify dataset exports. Available via the Apify Console, the dataset API, or the Apify client libraries (Python, JavaScript). Also integrates with Zapier, Make, n8n, and Google Sheets.

---

## Alternative: the official Threads API

Meta publishes an [official Threads API](https://developers.facebook.com/docs/threads), but it has hard constraints for public-data use cases:

- Only reads data from accounts you own or that have granted access — no competitor monitoring, no trend research, no hashtag scraping
- Requires OAuth setup, app review for publishing tools, and a Facebook Developer account
- Rate limits and endpoint coverage are narrower than what's visible to a logged-out browser

For market research, social listening, trend analysis, and competitive intelligence on public Threads data, this actor is a simpler path. For posting, managing your own account, or building automation on authorized accounts, use Meta's official API.

---

## Disclaimer

This scraper only collects publicly visible Threads data. It does not access private accounts, bypass authentication, or extract personal information beyond what a logged-out visitor can see. Users are responsible for ensuring their use case complies with applicable law (GDPR, CCPA, local data protection regulations) and Meta's Terms of Service. Use the tool for legitimate research, monitoring, and analytics — not for spam, harassment, or unauthorized data resale.

---

*Threads scraper · Meta Threads API alternative · Threads posts · Threads hashtag scraper · Threads keyword search · Threads user profile scraper · Threads replies · Threads custom feed · social listening · brand monitoring · competitive intelligence · KOL tracking · influencer analytics · marketing data*
