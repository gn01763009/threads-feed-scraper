# Migration Guide — Input Schema v0.3 → v1.0

> If you are running **Threads Scraper v0.3 or earlier**, your saved inputs and scheduled runs will stop working after v1.0 ships. This document shows you exactly how to update.

## Why the change?

v1.0 introduces an explicit `mode` selector so the actor knows upfront which type of data you want to extract. The old "auto-detect from whichever field you filled in" flow was ambiguous when multiple fields were populated. It also couldn't express features like bulk paste, relative dates, and grouped UI sections.

## TL;DR — What's breaking

| Old behaviour (v0.3) | New behaviour (v1.0) |
|----------------------|----------------------|
| No `mode` field — auto-detected from which input you filled in | **`mode` is required** — pick one of `user`, `hashtag`, `search`, `profile`, `post`, `feed` |
| `profileUrls` — array of full Threads profile URLs | **`usernames`** — array of plain usernames (no `@`, no URL) |
| `searchKeywords` — array for keyword search | **`keywords`** — unified for both hashtag mode and search mode |
| `searchTags` — separate array for hashtag search | **Removed.** Use `keywords` with `mode: "hashtag"` |
| `searchSort` — "top" / "recent" | **`searchSort`** — unchanged, but only applied when `mode: "search"` |
| `dateFrom` / `dateTo` — YYYY-MM-DD text | **`dateFrom` / `dateTo`** — datepicker, accepts YYYY-MM-DD **or** relative (`7 days`, `1 month`) |
| No batch paste support | **`bulkUsernames` / `bulkKeywords`** — textarea, one value per line, merged into the regular arrays |
| Batch limit 20 | **Batch limit 100** on `usernames` and `keywords` |

---

## Field-by-field mapping

### 1. User profile scraping

**Before (v0.3):**
```json
{
  "profileUrls": [
    "https://www.threads.com/@zuck",
    "https://www.threads.com/@mosseri"
  ],
  "maxPosts": 50
}
```

**After (v1.0):**
```json
{
  "mode": "user",
  "usernames": ["zuck", "mosseri"],
  "maxPosts": 50
}
```

**What changed:**
- New required `mode: "user"`
- `profileUrls` → `usernames`
- Strip the `https://www.threads.com/@` prefix — just the plain username
- `@` is optional but the underlying pattern strips it anyway

---

### 2. Keyword search

**Before (v0.3):**
```json
{
  "searchKeywords": ["AI news", "LLM"],
  "searchSort": "top",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-04-01",
  "maxPosts": 100
}
```

**After (v1.0):**
```json
{
  "mode": "search",
  "keywords": ["AI news", "LLM"],
  "searchSort": "top",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-04-01",
  "maxPosts": 100
}
```

**What changed:**
- `searchKeywords` → `keywords`
- Added required `mode: "search"`
- Date fields unchanged for absolute dates, but now also accept relative expressions like `"7 days"` or `"1 month"`

---

### 3. Hashtag / topic scraping

**Before (v0.3):**
```json
{
  "searchTags": ["#寵物友善", "tech"],
  "maxPosts": 80
}
```

**After (v1.0):**
```json
{
  "mode": "hashtag",
  "keywords": ["#寵物友善", "tech"],
  "maxPosts": 80
}
```

**What changed:**
- `searchTags` field is **removed**
- Same values now go into `keywords` with `mode: "hashtag"`
- Leading `#` is still optional

---

### 4. Single post + replies

**Before (v0.3):**
```json
{
  "postUrls": ["https://www.threads.com/@user/post/ABC123"]
}
```

**After (v1.0):**
```json
{
  "mode": "post",
  "postUrls": ["https://www.threads.com/@user/post/ABC123"]
}
```

**What changed:**
- Only the required `mode: "post"` addition — field name and format unchanged.

---

### 5. Custom feed scraping

**Before (v0.3):**
```json
{
  "feedUrls": ["https://www.threads.com/custom_feed/18113589370710265"]
}
```

**After (v1.0):**
```json
{
  "mode": "feed",
  "feedUrls": ["https://www.threads.com/custom_feed/18113589370710265"]
}
```

**What changed:**
- Only the required `mode: "feed"` addition.

---

## New feature — Bulk paste (`bulkUsernames` / `bulkKeywords`)

If you want to scrape a long list (say, 80 KOL accounts) without clicking "Add" 80 times in the Apify Console, paste directly into the new `bulkUsernames` textarea:

```
zuck
mosseri
finkd
threadsapp
taylornikolai
...
```

One value per line. The actor splits on newline and merges them into `usernames` before running. The same pattern applies to `bulkKeywords` for `hashtag` / `search` modes.

**Tip for non-technical users:** open your Google Sheet or Excel column of usernames, copy the whole column, and paste into `bulkUsernames`. That's it.

---

## How to migrate a scheduled run

1. Open [Apify Console → Schedules](https://console.apify.com/schedules).
2. Find schedules pointing at `threads-feed-scraper`.
3. Edit the input JSON following the mapping above.
4. **Save** — do **not** test run during peak hours in case the old input was still working from a cached schema.
5. Once saved, trigger a manual run to verify the output looks identical to your old runs.

---

## How to migrate an API integration

If you call the actor via the Apify API:

```diff
  POST https://api.apify.com/v2/acts/<your-actor-id>/runs
  {
-   "profileUrls": ["https://www.threads.com/@zuck"],
+   "mode": "user",
+   "usernames": ["zuck"],
    "maxPosts": 50
  }
```

Your HTTP client code doesn't change — only the JSON body.

---

## Need help?

- Open an issue on the actor's Apify Store page (Issues tab).
- If you had a working v0.3 input and want help translating it, paste it into an issue and we'll write the v1.0 equivalent for you.

---

## Version history

| Version | Date | Key changes |
|---------|------|-------------|
| v0.3 | 2026-03-29 | Initial public release with auto-detect input |
| v1.0 | 2026-04-TBD | Required `mode`, renamed fields, bulk textarea, 100-item batch limit, relative date picker, localized listings |
