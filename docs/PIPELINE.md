# Ingestion pipeline

Automated discovery and verification that keeps `data/` current. It finds
new announcements about logistics and warehousing projects, extracts candidate
facts, checks every fact against the page text in code, and either publishes
the change (with a ChangeRecord) or queues it for human review. It never
invents data, never deletes verified data, and never reports "nothing new"
when a scan failed.

> **Status (proof of concept).** Live API spend has not been approved. All
> tests use fakes. The scheduled workflow does nothing until the repository
> variable `SCHEDULE_ENABLED` is set to `true`. The live checks so far are
> fetch-only dry runs with `--search none` (results below).

Contracts: `docs/DATA_MODEL.md` (schemas, validation, ids, transitions,
metrics). The pipeline imports those `shared/` functions and does not
re-implement them.

---

## 1. Commands

| Command | What it does |
|---|---|
| `npm run ingest -- [flags]` | Live run: scan sources, extract, verify, write `data/`, open issues for held items. |
| `npm run ingest:dry -- [flags]` | Same, but writes no data files and opens no issues. Still writes a report to `pipeline-runs/`. |
| `npm run review -- list \| show <id> \| accept <id> [--note ..] [--verification ..] \| reject <id> --note ..` | Resolve a pending-review item (see `docs/REVIEW_GUIDE.md`). |
| `npm run check-links -- [--limit n] [--json]` | Polite dead-link check of every URL the register cites. Prints warnings only and changes nothing. |

Ingest flags: `--dry-run`, `--since 7d|YYYY-MM-DD` (default 7 days),
`--source id[,id]`, `--max-searches n`, `--no-issues`, `--recheck n`,
`--search anthropic|brave|none`, `--no-extract`, `--json`.

**Zero-spend mode:** `--dry-run --search none --no-extract`. With extraction
off and no Anthropic search, the pipeline never reads `ANTHROPIC_API_KEY` and
never builds an API client, so no Anthropic call is possible even when the key
is set. Documents skipped this way are not marked processed, so a later paid
run still sees them.

Exit codes: `0` = success or partial (some sources failed; a warning is
printed and, in Actions, annotated). `2` = failed run or configuration error
(for example a missing `ANTHROPIC_API_KEY` on a live run). In both failure
cases the data files are unchanged.

Every run writes `pipeline-runs/<runId>[-dry].json` (git-ignored by a
`.gitignore` inside that folder). The report covers the sources scanned and
failed, every fallback attempt, the documents and their outcomes, the
candidate facts, what was published or held and why, searches used, tokens by
model and the estimated cost in USD. Live runs also append a short summary to
`data/pipeline-state.json` (last 30 runs).

---

## 2. Architecture

```
data/sources.json ──► discovery.ts ──► fetch (http.ts, robots.ts, html.ts)
                         │   fallbacks: rss | sitemap | html_list | alt_url | site_search
                         │   blocked article → search index snippet → syndicated copies
                         ▼
   recheck.ts (rotating search on active projects)
                         ▼
   extraction.ts  (Claude Opus 5.5, JSON schema, verbatim quotes, nulls)
                         ▼
   grounding.ts   (code-only anti-fabrication gate)
                         ▼
   match.ts → decide.ts  (publication rules)  ──► held → pending-review.json + GitHub issue
                         ▼ publish
   patch.ts (apply + ChangeRecords) → validateRegister → store.ts (atomic write)
```

| Module | Role |
|---|---|
| `config.ts` | Models, prices, caps, politeness. Environment overrides. |
| `types.ts` | Interfaces for every external effect: `Fetcher`, `SearchProvider`, `Extractor`, `IssueTracker`, `Clock`, `Logger`. |
| `sources.ts` | Schema and loader for `data/sources.json`. |
| `http.ts`, `robots.ts` | Polite fetcher: one request at a time, an honest User-Agent, robots.txt, a per-host minimum interval (3 s by default), a 20 s timeout, no retries, and challenge or CAPTCHA pages classed as blocked. |
| `html.ts`, `dates.ts` | Readable text, links with their listing dates, published-date detection, RSS/Atom and sitemap parsing, date expressions. |
| `discovery.ts` | Per-source fallback chain and article fetching. |
| `search/anthropic.ts`, `search/other.ts`, `search/budget.ts` | Search providers (Claude Haiku 5.5 with the server web-search tool; `none`; a thin Brave adapter) plus the per-run cap and accounting. |
| `llm/anthropic-extractor.ts`, `extraction.ts` | Extraction request, prompt, output schema and validation. |
| `grounding.ts` | Quote, number, date, unit, URL and party checks; area-basis and forecast safeguards. |
| `match.ts`, `decide.ts` | Identity matching, dedupe and the publication rules. |
| `patch.ts` | The one apply path, with ChangeRecords. Used by both the pipeline and `review`. |
| `store.ts` | Snapshot reading, the all-or-nothing atomic write, `data/pipeline-state.json`. |
| `run.ts` | The orchestrator. `cli/*.ts` are the command-line entry points. |
| `issues.ts` | GitHub REST issues, idempotent by review id. |
| `links.ts` | The dead-link checker. |
| `cost.ts` | Token and search accounting at list prices. |
| `factory.ts` | Production wiring. Tests never use it. |

---

## 3. Stages

### 3.1 Discovery (`discovery.ts`)

Each enabled source in `data/sources.json` has an ordered list of
`accessMethods`. They are tried in order, and the first method that works
wins:

* `rss`: the feed must parse and contain items. Items older than the window are dropped.
* `sitemap`: an index or a urlset (at most `maxChildSitemaps` children).
  Only Google-News `publication_date` values are trusted as article dates,
  because `<lastmod>` is often the crawl time (as on DP World).
* `html_list` / `alt_url`: the page must contain links matching
  `linkPattern` (and `keywords`, if given). A page without such links is a
  failure ("rendered by JavaScript" when it looks like an SPA). Listing dates
  are read only from the entry itself, never from a neighbouring entry, or
  from date-shaped URLs (`/2026/novemebr/05-11/`).
* `site_search`: a date-restricted, site-restricted query through the search
  provider. It is reported as skipped when the provider is `none` or the cap
  is reached.

The scan status goes into `meta.sourceScans`: `ok` (the first method worked),
`fallback_used` (with the `method` that worked and a note on the earlier
failures), `failed` (every method failed, with all reasons listed) or
`skipped` (the source is disabled).

Articles: up to `maxArticlesPerSource` new (unprocessed) links per source are
fetched. A page that is blocked (403, 429 or a challenge page), disallowed by
robots.txt, or too short is not worked around. Instead:

1. If the search returned a snippet, the snippet becomes an `indexed` document.
2. Otherwise the pipeline searches the index for the exact title on that site (to locate the original).
3. It also searches for the title elsewhere and reads copies on other
   configured sources directly (WAM, Dubai Media Office, reputable media).
   Results from unconfigured sites are ignored.

Window: documents dated before `--since` (default 7 days) are marked
processed and skipped. Documents with no detectable date are skipped and
recorded as `no_publication_date`. Date order: page metadata, then the
listing or feed date, then the first date in the opening text.

### 3.2 Rotating recheck (`recheck.ts`)

Each run (when no `--source` filter is given) picks `recheckPerRun` (5)
active projects (not operational or cancelled) that were checked least
recently, oldest `lastVerified` first. For each it searches for status news
since `lastVerified`. Results go through the normal path, tagged with the
project id (a weak +1 matching hint, never enough on its own).

### 3.3 Search provider (`search/*`)

`SearchProvider.search({ query, site?, after?, before?, max })`:

* `anthropic` (default): Claude Haiku 5.5 (`claude-haiku-5-5`) with the
  server web-search tool `web_search_20250305` (`max_uses: 1`,
  `allowed_domains` = site). The search-tool version is in config. The basic
  variant is used because the skill documentation lists Haiku 5.5 among the
  models that do **not** take the dynamic-filtering `web_search_20260209`
  variant; set `PIPELINE_WEB_SEARCH_TOOL` to change it once confirmed. Only
  the tool's structured results are kept: URL, title, page age, and
  `cited_text` from web-search citations. The model's own text is discarded
  and never used as evidence. `tool_choice` is left on `auto`, the effort is
  `low`, and a refusal (`stop_reason: "refusal"`) is reported as a failed
  search. Haiku 5.5 has no server-side refusal fallback.
* `none`: discovery uses direct fetches only.
* `brave`: a thin adapter (`BRAVE_API_KEY`). Tavily or another API can be
  added in the same shape (map results to `{url, title, snippet, pageAge}`).
  It has not been exercised live.

Every search counts against `maxSearchesPerRun` (40, or `--max-searches`).
Every returned URL is recorded, and the grounding gate accepts only URLs that
were fetched or returned this run.

### 3.4 Extraction (`extraction.ts`, `llm/anthropic-extractor.ts`)

Claude Opus 5.5 (`claude-opus-5-5`) is called through the TypeScript SDK as a
streaming request (`client.beta.messages.stream(...).finalMessage()`) with:
`output_config.format` set to a JSON schema generated from the zod schema;
`thinking: {type: "adaptive"}`; `output_config.effort: "high"`, set
explicitly because Opus 5.5 defaults to `medium`; no forced `tool_choice`; no
sampling parameters; and the server-side refusal fallback
(`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`). A
`refusal` or `max_tokens` stop, invalid JSON or a schema failure is recorded
as `extraction_failed`, and that document produces nothing. Token usage is
taken per model from `usage.iterations`, so a fallback model is billed under
its own name.

The prompt forbids guessing and outside knowledge, requires verbatim quotes,
requires null for anything not stated, and treats the article as untrusted
data. Each candidate fact records: identity and parties; location, zone and
emirate (with quotes); the event type and quote; the event date, its
precision and quote; areas `[{value, unit, basis, quote}]`; investment
`{amount, currency, quote}`; Grade-A wording; forecast versus actual
completion; scope; and ambiguities.

A cheap keyword pre-filter keeps obviously unrelated articles (sport,
politics) away from the paid model. Documents longer than 120,000 characters
are not sent to the model and are not truncated silently either (they are
recorded as `too_long_not_sent`). At most `maxExtractionsPerRun` (25) calls
are made per run. Any further documents are not marked processed and are
picked up in the next run.

### 3.5 Grounding: the anti-fabrication gate (`grounding.ts`)

A claim that fails any of these checks is never published:

* Every quote must be a substring of the fetched text (whitespace, quote
  marks and dashes are normalised; "…" splits a quote into ordered parts).
* Every number in a claim must appear in its own quote (with
  million/billion handling). The area unit must appear in the area quote, and
  the currency must appear in the investment quote.
* Every date must appear in its own quote at the stated precision. If no event
  date is stated, the page's publication date is used and the record says so.
* The document URL must have been fetched this run, or returned by search.
* Every named company and the zone must appear in the text.
* The emirate must be named in its quote, directly or through a known zone of that emirate.
* **Area basis:** hectare and acre figures, and quotes about a plot, land,
  site, yard, district or masterplan, are moved to `site_land_area`,
  `open_yard` or `district_area`. They never land in `warehouse_gfa` or
  `gla`. A quote mixing land and floor wording is held as ambiguous. Areas are
  converted with `shared/units.ts`.
* **Forecast versus actual:** a completion date whose quote contains forecast
  language ("expected", "scheduled", "will", "target", "by end of" …), or
  that lies in the future or after the publication date, becomes a
  `forecastCompletion`. An "opened" or "completed" event described as planned
  is held.

### 3.6 Matching and dedupe (`match.ts`, `decide.ts`, `store.ts`)

* Processed URLs (normalised) and a content hash are kept in
  `data/pipeline-state.json`. The same article is never extracted twice, and
  an identical copy at another URL is skipped.
* A candidate matches an existing project by a cited source URL, or by shared
  parties plus a compatible zone, a similar facility name and the asset type.
  Zone or asset type alone never identify a project. A unique, confident match
  updates that project. A tie, or a weak but plausible match, is held as
  ambiguous.
* The same milestone (same event type within 14 days, or the same URL) is not
  added twice. A syndicated copy adds a **source**, not an event or a project.
* An MoU followed by a signed agreement, or "under construction" followed by
  "operational", updates the **same** project and appends one dated event.
  The status follows `replayEvents` and must be a valid transition.

### 3.7 Publication rules (`decide.ts`)

A change is published automatically only when all of these hold:

1. **Authority**: an official (primary) source read directly, **or** two
   independent sites (at least one read directly) reporting the same
   milestone in this run.
2. **Grounding** passed for the claim.
3. **Identity** is unambiguous (a unique match, or a clearly new project with a name and a named company).
4. **Location**: the emirate is stated and grounded, and a zone or location is given.
5. **Area**: a reported area is grounded, or the text mentions no area at
   all. In the second case the record says "Floor area not disclosed in the
   cited source". If the text mentions area figures that were not extracted,
   the claim is held.
6. **Milestone**: a status-bearing event type, dated and not in the future.
7. The **status transition** is valid (`isValidTransition`).
8. There is **no conflict** with existing values: an area of the same basis
   within 1 %, the same investment and the same emirate.
9. **`validateRegister`** passes on the resulting data set. Each change is
   validated on its own and then again on the final file set.

Anything else becomes a `PendingReviewItem` (`new_project`, `update` or
`conflict`) with its evidence and `reasonHeld`. Held items are never dropped
and never published. When `GITHUB_TOKEN` and `GITHUB_REPOSITORY` are set, a
GitHub issue labelled `pending-review` is opened for each held item. The
review id is in the title, so an existing issue is reused. Without a token
the run logs `issues: skipped (no GITHUB_TOKEN …)`.

Non-Dubai findings (Fujairah, Sharjah …) are stored with their emirate, so
`computeMetrics` shows them as regional context only, or they are held if the
emirate is not stated. They never enter Dubai totals.

### 3.8 Apply and write (`patch.ts`, `store.ts`, `run.ts`)

* Every change writes a ChangeRecord with the previous value, new value,
  evidence URL, evidence date, reason, verification status (`verified_official`,
  `verified_multiple`, …) and `appliedBy`. A new project gets one
  record (`field: "*"`). An update gets one record per field (`events`,
  `sources`, `status`, `actualCompletion`, `latestMilestone`, `lastVerified`, …).
* `latestMilestone`, `lastVerified`, `events` (kept sorted) and `updatedAt` are maintained.
* Writes are atomic: every file goes to a temp file first, then all are
  renamed. If a rename fails, files already replaced are restored. Writes
  happen only after validation. Unchanged files are not touched, and
  unchanged records keep their original JSON (key order), so diffs show only
  real changes.
* `meta.lastAttemptedRun` and `lastRunStatus` are always updated.
  `meta.lastSuccessfulRun` advances only when the run completed (`success` or
  `partial`).

---

## 4. Failure behaviour

| Situation | Result |
|---|---|
| A source's listing is blocked, empty or JS-only | Next method. `fallback_used` with a note. |
| Every method of a source fails | `failed` in `meta.sourceScans` with every reason. The source's existing data is kept. The run becomes `partial` and the summary names the source. |
| **All** sources fail | Run `failed`. Register, changelog and pending-review are **byte-identical**. Meta records the failure. `lastSuccessfulRun` is not advanced. The summary lists the failed sources and never says "no new announcements". Exit 2, so nothing is committed in Actions. |
| Data invalid before the run | Aborted before scanning. Nothing written. |
| Final validation fails | Nothing written. Run `failed`. |
| Missing `ANTHROPIC_API_KEY` (live run) | Clear error, exit 2. Nothing read or written. |
| Model refusal, truncation or bad JSON | That document is `extraction_failed` and produces nothing. Transient API errors are retried next run. |
| Authentication error from the API | The run aborts (`failed`). Nothing written. |
| Issue creation fails | Warning only. The item keeps no `issueUrl` and is retried next run. |

The summary says "No new in-scope announcements were found …" only when every
scanned source succeeded, nothing was published or held, and every relevant
document was actually analysed. Documents skipped by `--no-extract`, a
missing key, the extraction cap or a model failure are counted in a separate
line ("… relevant document(s) were NOT analysed …"). Even then it adds
"coverage is not exhaustive".

---

## 5. Source access results (live probes, 2026-11-11)

Probes were made from the build container. Each was a single request with an
honest User-Agent; robots.txt was read first and nothing was retried. Hosts
outside the container's network allowlist (DHL, FedEx, UPS, DSV, CEVA,
Aramex, Maersk, Arcapita, Dutco, Reuters, Zawya, Arabian Business, Logistics
Middle East, Construction Week, Dubai Trade) were **not probed**. Their
listing URLs come from desk research and are marked unverified in
`data/sources.json`.

| Source | Observed | Configured order |
|---|---|---|
| DP World | `/en/news/releases/uae/` redirects to `/en/news/uae`: 2 MB of HTML and only about 2 KB of text, so the page is **JS-rendered** with no article links. The sitemap index has 9 children (4,274 URLs, 74 under `/en/news/uae/`); `<lastmod>` is not a publication date. | html_list → **sitemap** → site_search |
| Jafza | Listing **works** (12 dated article links). Article pages sometimes answer with a **bot-verification interstitial** ("One moment, please… request is being verified"), which is classified as blocked and not bypassed. | html_list → site_search |
| Dubai South | Listing **works** (12 links, dates inside the link). Article pages carry no date in metadata, so the listing date is used. | html_list → sitemap → site_search |
| EZDubai | Home page has no news section; its news appears in the Dubai South newsroom. | Dubai South newsroom filtered for EZDubai → site_search |
| Dubai Industrial City (TECOM) | `dubaiindustrialcity.ae` press releases **work** (dated). `tecomgroup.ae` answers **403** (known; not retried). | html_list → site_search (tecomgroup.ae) |
| Dubai Customs | Mobile listing `/en/mobile/Pages/News.aspx` **works** (6 dated items); article pages are server-rendered inside an ASP.NET `<form>`. robots.txt reset the connection on one probe. | alt_url → site_search |
| PCFC | `/en/Pages/news.aspx` and `/en/Pages/Warnings-and-Circulars.aspx` both **403**. robots.txt 404. | html_list → alt_url → site_search |
| Fujairah Port | `/media-center/press-releases/` 200 (year categories); the `/feed/` RSS **works**. Regional context only. | rss → html_list → site_search |
| WAM | The listing HTML has headlines and teasers but **no article links** (JS-rendered). The API refused a request earlier. | html_list (fails) → site_search |
| Dubai Media Office | Home page **works** (dated `/en/news/2026/<month>/DD-MM/` links). | html_list (keyword filter) → site_search |
| dnata | Media centre **works** (dated article links). | html_list → site_search |
| Emirates | `/media-centre/`: the HTTP/2 stream was reset on the probe; the tag RSS feed is unverified. | html_list → rss → site_search |
| Aldar | `/en/news-and-media` **403**. The sitemap is listed in robots.txt. | html_list → sitemap → site_search |
| Gulf News | `news_sitemap.xml` **works** (337 URLs with publication dates). | sitemap (keywords) → site_search |
| The National | robots.txt disallows `/article/` and `/section/`; the news sitemap is listed. | sitemap → site_search |
| Khaleej Times | The news sitemap is listed in robots.txt. | sitemap → site_search |

### Live dry run (fetch path, `--search none`, no API key)

```
$ NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=… npm run ingest:dry -- --search none \
    --source dpworld,jafza,dubai-south,tecom-dic,dubai-customs,pcfc,dubai-media-office,fujairah-port,gulf-news --since 14d
scan dpworld …
  fallback_used via sitemap: 4274 sitemap URLs, 74 matching, 74 candidates; earlier: html_list failed: page rendered by JavaScript: no article links in the HTML (8 new document(s))
scan jafza …
  ok via html_list: 12 article links, 3 in window (3 new document(s))
scan dubai-south …
  ok via html_list: 12 article links, 1 in window (1 new document(s))
scan tecom-dic …
  ok via html_list: 80 article links, 1 in window (1 new document(s))
scan dubai-customs …
  ok via alt_url: 6 article links, 2 in window (2 new document(s))
scan pcfc …
  failed: html_list failed: blocked (HTTP 403): HTTP 403 | alt_url failed: blocked (HTTP 403): HTTP 403 | site_search skipped: no search provider (none) (0 new document(s))
scan fujairah-port …
  ok via rss: 10 feed items, 0 in window (0 new document(s))
scan dubai-media-office …
  ok via html_list: 2 article links, 2 in window (2 new document(s))
scan gulf-news …
  ok via sitemap: 337 sitemap URLs, 6 matching, 6 candidates (6 new document(s))
dry run: no data files written, no issues opened

Run run-20261111T132251Z (dry run): PARTIAL.
1 of 9 source(s) could NOT be scanned: pcfc. Existing data for them was kept; announcements from them may be missing.
8 source(s) scanned (1 via a fallback method); 23 new document(s); 0 extracted; 0 candidate fact(s).
0 change(s) published; 0 held for review; searches used 0/40; estimated cost $0.0000.
```

That run made 52 HTTP requests in 2 min 14 s. Per-document outcomes from its report:

* DP World: 8 sitemap articles fetched, all `outside_window` (old items; see the note below).
* Jafza: 3 `outside_window`.
* Dubai South, DIC, Dubai Customs (2) and Gulf News (5) reached the extraction
  step, which reported `extraction skipped (no key)`.
* Dubai Media Office (2) and one Gulf News sport article: `not_relevant`.

Earlier dry runs in this session surfaced three real-world problems, which
were fixed and are now covered by tests:

* ASP.NET pages lost their text because `<form>` was stripped.
* Listing dates were taken from a neighbouring entry, or missed where text
  nodes touch ("Read moreNovember 9, 2026").
* Jafza's bot-verification page was not recognised as a block.

In this sandbox, Node's `fetch` needs `NODE_USE_ENV_PROXY=1` and the proxy CA
(`NODE_EXTRA_CA_CERTS`). Without them every robots.txt request failed, and the
run correctly reported **all sources failed**. GitHub-hosted runners do not
need these.

**DP World note:** the sitemap gives no publication dates, so the first runs
work through the 74 UAE news URLs, 8 per run (no model calls, since they are
outside the window) until all are processed. After that only new URLs are
fetched.

---

## 6. Configuration

All in `pipeline/config.ts`, with environment overrides (see `.env.example`):

| Setting | Default | Env |
|---|---|---|
| Search model | `claude-haiku-5-5` | `PIPELINE_SEARCH_MODEL` |
| Extraction model | `claude-opus-5-5` | `PIPELINE_EXTRACT_MODEL` |
| Web-search tool version | `web_search_20250305` | `PIPELINE_WEB_SEARCH_TOOL` |
| Extraction effort | `high` | none (edit config) |
| Search provider | `anthropic` | `PIPELINE_SEARCH_PROVIDER` / `--search` |
| Searches per run | 40 | `PIPELINE_MAX_SEARCHES` / `--max-searches` |
| Extractions per run | 25 | `PIPELINE_MAX_EXTRACTIONS` |
| Recheck per run | 5 | `PIPELINE_RECHECK` / `--recheck` |
| Articles per source per run | 8 | `PIPELINE_MAX_ARTICLES_PER_SOURCE` |
| Min interval per host | 3,000 ms (a source can raise it with `minIntervalMs`) | `PIPELINE_MIN_INTERVAL_MS` |
| Window | 7 days | `--since` |
| Prices (USD) | Haiku 5.5 $0.10 / $0.50 per MTok (prompts ≤ 100K); Opus 5.5 $4 / $20 per MTok; web search $10 per 1,000 | `prices`, `webSearchPricePerSearch` |

Sources are edited in `data/sources.json` (validated by `pipeline/sources.ts`
and by a test). Each source has `id`, `name`, `tier` (primary | secondary),
`kind`, `publisher`, `domains`, `enabled`, an optional `minIntervalMs`,
`regionalContext`, an ordered list of `accessMethods`, `notes`, and a
`probe` record of what a live request actually returned.

---

## 7. Cost model

The report prices each run from actual usage: input, output, and cache
read/write tokens per model at the list prices above, plus searches at
$0.01 each. A model without a configured price is listed under
`unpricedModels` rather than guessed.

**Typical run (estimate):**

| Item | Assumption | USD |
|---|---|---|
| Searches | 14 search-only sources + about 6 fallbacks + 5 rechecks + about 5 for blocked articles ≈ **30** | 0.30 |
| Haiku 5.5 tokens | 30 calls × about 6k input (search results) + 300 output | 0.02 |
| Opus 5.5 extraction | about **10** new relevant documents × (about 5k input + about 3k output including adaptive thinking at effort `high`) = $0.08 each | 0.80 |
| **Per run** | | **≈ $1.1** |
| Per day (2 scheduled runs) | | ≈ $2.2 |
| Per 30 days | | ≈ $65 |

**Bounds:**

* With the caps (40 searches, 25 extractions) and about 3k output each, a run
  costs about **$2.5**.
* Long thinking (around 8k output per document) would bring that to about
  **$4.9**.
* The theoretical ceiling, if every call used its full 32k-token output
  budget, is about **$17** per run.

**Ways to lower the cost:**

* `extractEffort: 'medium'` (the Opus 5.5 default) roughly halves the output tokens.
* Lower `PIPELINE_MAX_EXTRACTIONS`.
* `--search none` removes search spend but loses the fallbacks.
* Disabling some search-only sources trims the search count.

The first live run after a quiet period costs about the same as a typical
run, because old articles are skipped before any model call.

---

## 8. GitHub Actions (`.github/workflows/ingest.yml`)

* **Triggers:** `schedule` at `30 4 * * *` and `30 12 * * *` UTC (08:30 and
  16:30 Dubai), plus `workflow_dispatch` with the inputs `dry_run`,
  `search_provider` (`none` | `anthropic`), `extract`, `since`,
  `max_searches` and `redeploy`.
* **Manual defaults are zero spend:** `dry_run: true`, `search_provider:
  none`, `extract: false`. In that mode the workflow does not even hand the
  API key to the pipeline (it is exported only when the plan says a paid call
  is intended), and the CLI is given `--search none --no-extract`. A paid run
  must be chosen explicitly (`search_provider: anthropic` and/or `extract:
  true`).
* **No recurring spend by default:** the job's `if:` runs scheduled events
  only when the repository variable `SCHEDULE_ENABLED` is exactly `true`.
  Manual dispatch always runs. A scheduled run is a full live run (search
  from `vars.PIPELINE_SEARCH_PROVIDER`, default `anthropic`; extraction on;
  not dry).
* **Steps:** checkout `main`, Node 22, `npm ci`, `npm test`, *Plan run*
  (resolves the mode and prints it), *Report whether the API key is
  configured* (prints `true`/`false` only), ingest, a per-source scan table
  in the job summary, `npm run validate`, commit `data/` to `main` as
  `github-actions[bot]` **only if it is not a dry run, ingest and validation
  passed, and something changed**, upload `pipeline-runs/*.json` as an
  artifact, then a job summary. A failed ingest (exit 2) or a failed
  validation fails the job and nothing is committed.
* **Deploy:** when a commit was made (or `redeploy` was ticked), a second job
  calls the reusable `./.github/workflows/deploy.yml`, which checks out
  `main` itself.
* **Permissions:** `contents: write`, `issues: write`, `pages: write`,
  `id-token: write`.
* **Concurrency:** group `ingest`, without cancel-in-progress, so two ingests never overlap.

### Enabling it

1. Add the secret **`ANTHROPIC_API_KEY`**: Settings → Secrets and variables → Actions → New repository secret.
2. Optionally create a `pending-review` label (GitHub creates it on first use).
3. Try it: Actions → *Ingest announcements* → Run workflow, leaving the
   defaults (zero spend). Read the job summary and the report artifact. For
   a first paid test (only with the owner's go-ahead), keep `dry_run`
   ticked, choose `search_provider: anthropic` and tick `extract`.
4. To turn the schedule on, add the repository **variable**
   `SCHEDULE_ENABLED` with the value `true`. To turn it off, delete the
   variable or set any other value.
5. Optional: the variable `PIPELINE_SEARCH_PROVIDER` sets the search provider
   for scheduled runs (`none` removes search spend).

Secrets needed: `ANTHROPIC_API_KEY` (for live runs). `GITHUB_TOKEN` is
provided automatically. Optional: the secret `BRAVE_API_KEY`, used only by
scheduled runs with `PIPELINE_SEARCH_PROVIDER=brave`.

---

## 9. Known limitations

* Corroboration ("two independent sources agree") is checked only among the
  documents of the same run. A second source arriving in a later run does not
  release an earlier held item automatically; a reviewer does.
* Pages that need JavaScript are not rendered. The pipeline relies on
  sitemaps, feeds and search instead.
* A search snippet (`indexed`) is never enough on its own to publish.
* The model's sector and asset-type classification is a judgement, not a
  quoted claim. Both are visible to reviewers in the record.
* `data/pipeline-state.json` (processed URLs, content hashes and run
  summaries; no keys or personal data) is committed with the data but is
  **not** copied to the public site: `scripts/sync-data.ts` excludes it.
