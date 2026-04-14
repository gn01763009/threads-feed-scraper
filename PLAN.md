# Threads Scraper — Multi-Language Listing Strategy

> Last updated: 2026-04-14
> Status: Draft (approved direction, pending Phase 1 kickoff)

## TL;DR

Ship **one codebase** published as **multiple Apify Store listings** — one per target language — all priced identically at **$0.005 per result**. Differentiate by reliability, unified feature set (posts + replies + profiles + feeds), higher batch limits, and localized README / input schema. Primary competitor: `futurizerush` (two Threads listings, EN rated 1.11★, declining).

---

## 1. Market Data (Threads by country, 2026)

| Rank | Country | % of total Threads traffic | Installs | Language opportunity |
|------|---------|---------------------------|----------|----------------------|
| 1 | Taiwan 🇹🇼 | **21.08%** | 2.9M | Traditional Chinese (premium, highest intensity) |
| 2 | USA 🇺🇸 | 14.85% | 26.1M | English (largest pie) |
| 3 | Vietnam 🇻🇳 | 9.1% | 0.9M | Vietnamese (growing, low PPE maturity) |
| 4 | Brazil 🇧🇷 | 8.0% | 36.4M | Portuguese-BR (2nd biggest installs) |
| 5 | India 🇮🇳 | 7.33% | 54.2M | English (already covered) |
| 6 | Japan 🇯🇵 | 7.03% | 7.3M | Japanese (independent ecosystem) |

**Insight:** Taiwan has 6× the per-user intensity of the USA. Competitor `futurizerush` already charges 2.5× in their TC listing vs EN — Chinese users accept premium, but we unify pricing to simplify messaging.

Sources: [resourcera](https://resourcera.com/data/social/threads-users/), [thesocialshepherd](https://thesocialshepherd.com/blog/threads-statistics), [businessofapps](https://www.businessofapps.com/data/threads-statistics/), [emarketer](https://www.emarketer.com/content/top-10-countries-where-threads-has-woven-most-users)

---

## 2. Competitive Position (futurizerush teardown)

| | EN listing | ZH-TW listing |
|---|---|---|
| Lifetime runs | 14,709 | 87,852 (legacy whale burst) |
| **30d active users** | **142 ↗️** | **16 ↘️** |
| **30d runs** | **4,219 ↗️** | **313 ↘️** |
| **30d failure rate** | **41.6% ❌** | **47.6% ❌** |
| Rating | **1.11★ / 4 reviews** 💀 | 4.72★ / 3 reviews |
| Pricing | $0.004/result + $0.02/start | $0.01/result |
| Batch limit | 20 | 20 |

**Biggest opening:** EN market is active and unhappy. Reggie's current scraper already has 98% success rate — reliability is an immediate differentiator. ZH-TW market is declining but still claims the premium aesthetic, so we match the polish while undercutting on price.

---

## 3. Strategic Decisions (approved)

### 3.1 Pricing — **Unified $0.005 per result**
- Single price across all language listings, no region-based premium.
- Rationale:
  - Simpler messaging, one source of truth for cost.
  - Slightly above competitor's EN ($0.004) — we trade on reliability, not price floor.
  - Well below competitor's ZH-TW ($0.01) — instant 50% discount story for Taiwan users.
  - No Actor Start fee (competitor EN charges $0.02/start — that's friction we skip).

### 3.2 Shared codebase across listings
- **Single `src/` + single Git repo.** No forks, no branches per language.
- Per-language assets live in `.actor-{locale}/` directories:
  ```
  .actor/              → master / default (English, primary)
  .actor-zh-tw/        → Traditional Chinese listing assets
  .actor-pt-br/        → Portuguese-BR listing assets
  .actor-ja/           → Japanese listing assets
  ```
  Each directory contains its own `actor.json`, `input_schema.json`, `output_schema.json`, `dataset_schema.json`, `README.md`.
- Build/deploy flow via a small script `scripts/push-locale.ts`:
  1. Copy `.actor-{locale}/*` over `.actor/`
  2. Run `apify push`
  3. Restore `.actor/` from git
- Input schemas across locales share **identical field names + types + defaults**, only `title`/`description`/`enumTitles`/`sectionCaption` differ.
- Runtime behaviour is 100% locale-independent — only the listing UI differs.

### 3.3 Which languages to ship
**Phase rollout (not all at once):**

| Order | Locale | Why | Blocker risk |
|-------|--------|-----|--------------|
| 1 | **EN** (existing) | Largest pie + weakest competitor | None — just polish |
| 2 | **ZH-TW** | Highest per-user intensity, reggie is native | None — reggie writes copy |
| 3 | **PT-BR** | 2nd biggest install base (36M) | Copy quality — use AI + native review |
| 4 | **JA** | High engagement, premium market | Copy quality — same |

Phase 3+4 is a validation bet: if EN+ZH-TW ships in 4 weeks and proves the shared-codebase workflow works, PT-BR and JA are cheap to add (a few days each).

VN / ES / KO deferred until there's evidence the model scales.

---

## 4. Input Schema Upgrade

Competitor's polish (mode dropdown + sectionCaption grouping + emoji labels) is the baseline Taiwanese users expect. We need to match and exceed.

### 4.1 Schema structure (applies to all locales)

```
🎯 Mode (dropdown: user / hashtag / search / profile / post / feed)
  ├─ 👤 User Mode Settings
  │   └─ usernames (array, max 100 ⬆️, CSV upload support, pattern validated)
  ├─ 🏷️ Keyword / Hashtag Settings
  │   └─ keywords (array, max 100 ⬆️, accepts # or plain)
  ├─ 🔎 Search Settings
  │   └─ searchSort (top / recent)
  ├─ 📅 Date Range (search mode only)
  │   ├─ dateFrom (datepicker, absoluteOrRelative — supports "7 days" / "1 month")
  │   └─ dateTo (same)
  ├─ 📦 Direct URL Inputs (advanced)
  │   ├─ postUrls (for reply scraping)
  │   └─ feedUrls (custom feeds)
  └─ ⚙️ General Settings
      ├─ maxPosts (1–500, default 200)
      └─ scrollCount (1–20, default 5)
```

### 4.2 Differentiation levers (vs competitor)
- **Batch limit 20 → 100** on usernames and keywords (direct response to reported "批量查詢" pain).
- **CSV upload** for bulk imports via a Key-Value Store key or file reference (competitor has no equivalent).
- **Unified `postUrls` + `feedUrls`** — competitor split replies into a second actor; we keep one tool.
- **Relative dates** ("7 days", "1 month") to match competitor's `absoluteOrRelative` datepicker.
- **Pattern-validated usernames** + uniqueItems to prevent duplicates.
- Mode dropdown is **explicit but non-breaking**: current auto-detect behaviour still works when mode is omitted.

### 4.3 Emoji labels in all locales
Emoji is locale-neutral. Keep the exact same emoji across EN/ZH-TW/PT-BR/JA for visual consistency.

---

## 5. Per-Listing Positioning

### Listing A — English (existing `threads-feed-scraper`)
- **Title:** `Threads Scraper - Posts, Profiles, Hashtag & Keyword Search`
- **Tagline:** "The reliable Threads scraper — 99% success rate, no rate limits, unified profiles + posts + replies."
- **Target users:** International marketers, SaaS devs, data journalists, brand monitoring vendors.
- **Hook:** Reliability (contrast competitor's 1.11★).
- **README tone:** Technical, benchmark-driven, bilingual-free (keep it pure EN).

### Listing B — Traditional Chinese (new)
- **Title:** `Meta Threads 爬蟲 - 貼文、標籤與關鍵字搜尋 | 台灣在地支援`
- **Tagline:** 「台灣人做給台灣人用的 Threads 爬蟲。99% 成功率、無需登入、支援輿情監控與競品分析。」
- **Target users:** 台灣品牌行銷、公關公司、KOL 經紀、輿情分析師、新聞媒體。
- **Hook:** 在地化 + 繁中客服 + 案例用台灣 KOL。
- **README tone:** Friendly 繁中 + Taiwan-specific use cases (台灣熱門 hashtag、本土 KOL 範例).

### Listing C — Portuguese-BR (validation bet)
- **Title:** `Raspador do Threads - Posts, Perfis, Hashtags e Busca por Palavra-chave`
- **Target users:** Brazilian marketers, influencer agencies.
- **Hook:** Local-language listing in a market dominated by English tools.

### Listing D — Japanese (validation bet)
- **Title:** `Threads スクレイパー - 投稿・プロフィール・ハッシュタグ・キーワード検索`
- **Target users:** Japanese social listening shops, agencies.
- **Hook:** 日本語対応 + 低価格 + 高信頼性.

---

## 6. Execution Phases

### Phase 1 — Codebase upgrade (Week 1–2)
- [ ] Refactor `input_schema.json` with `mode` dropdown + sectionCaption grouping + emoji labels
- [ ] Raise batch limits: `usernames` 20 → 100, `keywords` 20 → 100
- [ ] Add `dateFrom` / `dateTo` datepicker with `absoluteOrRelative` type
- [ ] Add CSV upload via Key-Value Store key (e.g. `usernamesKvsKey`)
- [ ] Keep auto-detect behaviour when `mode` is omitted (backward compatible for existing users)
- [ ] Update `src/` to honour new schema fields
- [ ] All existing tests must still pass; add tests for new fields
- [ ] Scripted deploy: `scripts/push-locale.ts` that swaps `.actor-{locale}/` assets before `apify push`

### Phase 2 — English listing relaunch (Week 3)
- [ ] Rewrite `.actor/actor.json` title + description
- [ ] Write new `README.md` following 10-section template (see §7)
- [ ] Update `.actor/input_schema.json` with polished labels + descriptions (EN)
- [ ] Configure `.actor/dataset_schema.json` with table view for Output tab
- [ ] Set pricing to `$0.005/result` (drop the `$0.02/start` fee, no start charge)
- [ ] Confirm with user before `apify push`
- [ ] Write Apify changelog post announcing the upgrade

### Phase 3 — ZH-TW listing launch (Week 4–5)
- [ ] Create `.actor-zh-tw/` directory with TC assets
- [ ] Translate input schema labels, descriptions, enumTitles
- [ ] Write TC README (same 10-section structure, localized examples with Taiwan KOLs)
- [ ] Register new Apify actor slot `threads-scraper-zh-tw` (or similar name)
- [ ] Run `scripts/push-locale.ts zh-tw` to deploy
- [ ] Pricing: same `$0.005/result`
- [ ] Announce on Threads (@reggie), Dcard 科技版, PTT Soft_Job

### Phase 4 — Traction sprint (Week 6–8)
- [ ] Publish 3 Threads posts demonstrating real use cases (run the actor, share the output)
- [ ] Write 1 Medium/blog EN tutorial → link to English listing
- [ ] Write 1 繁中部落格 post → link to ZH-TW listing
- [ ] Personally reach out to existing 6 active users, request reviews
- [ ] Target: 5+ reviews ≥ 4★ across both listings by end of Week 8

### Phase 5 — PT-BR + JA validation (Week 9–12, only if Phase 4 hits targets)
- [ ] Use Claude to draft PT-BR + JA README + input schema labels
- [ ] Get one native-speaker pass on each (UpWork or community)
- [ ] Create `.actor-pt-br/` and `.actor-ja/`
- [ ] Launch both, track 30d activity for 4 weeks before deciding next steps

### Phase 6 — Monitor & iterate (Week 13+)
- [ ] Weekly Friday check: active users, runs, success rate, reviews per listing
- [ ] Track competitor deltas (they upgrade → we upgrade)
- [ ] Log every user-reported issue with priority tag
- [ ] Quarterly: decide on adding VN / ES / KO / IT

---

## 7. README 10-Section Template (universal, per-locale translated)

1. H1 title + one-paragraph pitch
2. What this actor extracts (bullet list of fields, grouped by author vs post)
3. Three supported modes (user / hashtag / keyword search) + quick description
4. Inputs table (markdown table of every field, type, required, description)
5. 4 JSON usage examples (one per mode + one advanced)
6. Important notes / caveats (max_posts is a ceiling, some fields may be null, rate limit behaviour)
7. FAQ (5 questions — username format, partial matches, missing fields, date filter scope, output format)
8. Alternative: official Threads API (compare positioning)
9. Disclaimer (educational use, ToS compliance)
10. SEO keywords line (language-specific keyword stuffing for Store search)

---

## 8. KPIs & Targets

### Weekly dashboard (check Fridays)

| Metric | Now (EN) | Month 1 | Month 3 | Month 6 |
|--------|----------|---------|---------|---------|
| 7d active users (all listings) | 6 | 15 | 50 | 150 |
| 30d runs (all listings) | 227 | 800 | 3,000 | 10,000 |
| 30d success rate | 98% | ≥95% | ≥95% | ≥95% |
| Total reviews | 0 | 3 | 10 | 25 |
| Average rating | n/a | 4★+ | 4.5★+ | 4.5★+ |
| Monthly revenue (USD) | ~$0 | $50 | $200 | $500 |
| Active listings | 1 | 2 | 4 | 4+ |

### Per-listing health thresholds
- 30d success rate drops below 95% → stop marketing, investigate
- New listing has 0 users after 4 weeks → rewrite README + reposition before abandoning
- Any review below 3★ → personal reply within 48h, ship fix within 1 week

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Threads UI change breaks scraper | Medium | High | Daily smoke test on GitHub Actions, auto-alert on failure |
| Competitor drops price to $0.003 | Low | Medium | Don't chase — double down on reliability and batch features |
| Maintaining N listings eats time | Medium | Medium | Automate with `scripts/push-locale.ts`; cap at 4 listings before Phase 5 |
| Non-native locale listings get bad reviews from copy quality | Medium | High | Require native speaker review before launching PT-BR / JA |
| A listing gets a 1★ review early | Medium | High | Personally reply, offer free runs to compensate, fix fast |
| Apify Store flags duplicate content across listings | Low | High | Make each README substantively different (not machine translation), include locale-specific examples |

---

## 10. Resolved Decisions

1. **Bulk input UX → textarea paste.** Add `bulkUsernames` / `bulkKeywords` fields with `editor: "textarea"`. Users paste one value per line (copy-paste an Excel column directly). Actor splits on newline and merges with the regular `usernames` / `keywords` arrays. Key-Value Store upload deferred until a user explicitly asks for it.
2. **Naming convention → `threads-scraper-{locale}`.** EN listing keeps its existing slot; new slots are `threads-scraper-zh-tw`, `threads-scraper-pt-br`, `threads-scraper-ja`.
3. **`mode` is required.** No active users with scheduled runs to preserve — clean break is fine. A `MIGRATION.md` is authored at the repo root to guide any returning users through the input-schema change. Input schema still sets `prefill: "user"` so the Console form is usable out of the box.
4. **Deploy script → `scripts/push-locale.ts`.** Lives at the repo root under `scripts/`. Added to `.dockerignore` so it doesn't ship into the actor image.
5. **Output schema localization → English keys, localized labels + examples.** Dataset field **keys** stay English across all locales (e.g. `username`, `like_count`) so downstream tooling is locale-portable. Only the Output tab **view labels** (`label` in `dataset_schema.json` view display) and README **JSON examples** are translated per locale.

---

## Appendix A — Competitor reference (futurizerush)

- EN listing: https://apify.com/futurizerush/meta-threads-scraper
- ZH-TW listing: https://apify.com/futurizerush/meta-threads-scraper-zh-tw
- Also runs: `threads-replies-scraper`, `threads-keyword-search`, `threads-user-posts-scraper-api`, `threads-search-scraper-api` — indicates a "split into many small actors" strategy that we explicitly reject in favour of unified multi-mode listings.

Full competitor teardown is saved in memory: `competitor_futurizerush_threads.md`.
