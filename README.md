# Dubai Logistics Investment Tracker

A source-verified register of logistics and warehousing investments,
construction milestones and openings in Dubai, with a small public website.

**Live site:** https://ktrout18.github.io/dubai-logistics-investment-tracker/

Status: proof of concept. The register and website are live. The automated
update pipeline is built and tested offline. Its GitHub workflow has run in
zero-spend mode and **once with paid search and extraction as a dry run**
(12 Nov 2026, nothing written). No live run that writes and commits data has
been made yet, and the twice-daily schedule is **off**. See
[Current limitations](#current-limitations).

## How it fits together

```
data/*.json  (canonical register: projects, changelog, pending review, meta, sources)
    │
    ├── shared/        counting rules, validation, status transitions, exports
    │
    ├── src/           static React site (Vite), built into dist/ and served by GitHub Pages
    │
    └── pipeline/      discover → fetch → extract → check against page text → publish or hold
                         → validate → commit data/ → deploy the site
```

* `data/register.json` is the single source of truth. The site and the
  pipeline both read it through the same `shared/` code, so a figure on the
  site is always computed by the same rules the tests check.
* Every change to a project has a ChangeRecord in `data/changelog.json` with
  its evidence URL. Anything uncertain goes to `data/pending-review.json`
  instead of the register.
* `npm run validate` must pass before anything is committed or deployed.

Details: `docs/DATA_MODEL.md` (schemas and counting rules),
`docs/PIPELINE.md` (the pipeline), `docs/SEED_NOTES.md` (how the register was
seeded), `docs/REVIEW_GUIDE.md` (reviewing and correcting), `docs/ACCEPTANCE.md`
(the owner's acceptance criteria and the evidence for each).

## How figures are counted

* **Measurement bases are never mixed.** Warehouse floor space means GFA or
  GLA, shown as two separate numbers. Built-up area that includes offices is
  a third, labelled number. Land, open yard and district areas, and figures
  whose basis the source does not state, are kept in their own buckets and
  never added to floor space.
* **Grade A** is "confirmed" only where the developer or an official source
  uses the words "Grade A" (the quote is stored). "Probable" needs published
  specifications. Confirmed and probable are never merged.
* **Dubai only.** Projects in other emirates are shown as regional context and
  never enter Dubai totals.
* **Delivered** means the latest sourced status is completed or operational
  *and* the actual completion date is in the year. A forecast never counts.
* **Two views.** The *briefing view* ("as reported") reproduces the owner's
  November 2026 briefing: 13 facilities opened plus one completed, about
  262,000 m² (261,600 m²) of floor space opened, 215,260 m² being built. The
  *strict view* applies the rules above to each source's own wording, so its
  floor-space figures are much lower (many sources give a size without a
  basis). `docs/SEED_NOTES.md` §3 explains every difference.

## Where the data comes from

* The owner's November 2026 briefing PDF (26 rows plus 3 "not counted"
  items), each row checked against public sources, plus further sourced
  research. 31 projects in total.
* Every source carries a verification level:
  **direct** means the page text itself was read; **indexed** means the page
  was seen only in search-engine results (title and snippet), not read.
  Indexed-only claims are flagged on the site.
* The register is **not exhaustive**. Private, unannounced and owner-occupier
  developments are often missing from public sources.

## Running it locally

Needs Node 22 (`.nvmrc`).

```bash
npm ci
npm run dev          # site at http://localhost:5173 (copies data/ into public/data first)
npm run typecheck && npm run lint && npm test && npm run validate && npm run build
```

## Refreshing the data

**From your machine (zero spend):**

```bash
npm run ingest:dry -- --search none --no-extract
```

This fetches the configured sources, reports what it found, writes a report
to `pipeline-runs/`, and changes no data. With `--search none --no-extract`
the pipeline never reads `ANTHROPIC_API_KEY`, so no API call is possible. A
paid live run is `npm run ingest` with `ANTHROPIC_API_KEY` exported (see
`docs/PIPELINE.md` §1 for all flags).

**On GitHub (manual workflow):**

1. Open the repository → **Actions** → **Ingest announcements**.
2. Click **Run workflow** (branch `main`).
3. Leave the defaults to run at zero cost: `dry_run` ticked,
   `search_provider` = `none`, `extract` unticked. The job summary shows the
   run plan, whether the API key is configured (true/false only), a
   per-source scan table and the report artifact.
4. A paid run needs an explicit choice: `search_provider` = `anthropic`
   and/or tick `extract`. Untick `dry_run` only for a run that should write
   and commit data. Tick `redeploy` to rebuild the site even when nothing
   was committed.

A run commits `data/` only if it is not a dry run, the ingest succeeded,
`npm run validate` passed and something changed. It then redeploys the site.

## Turning the schedule on

The workflow is scheduled at 04:30 and 12:30 UTC (08:30 and 16:30 Dubai), but
scheduled runs do nothing unless the repository **variable**
`SCHEDULE_ENABLED` is exactly `true`:

Settings → Secrets and variables → Actions → **Variables** → New repository
variable → name `SCHEDULE_ENABLED`, value `true`. Delete it (or set any other
value) to turn the schedule off again.

A scheduled run is a full live run (Anthropic search and extraction, writes
data, commits, deploys). The optional variable `PIPELINE_SEARCH_PROVIDER`
(`anthropic` | `none` | `brave`) changes the search provider for scheduled
runs.

## Secrets

* `ANTHROPIC_API_KEY` (repository secret): needed for paid runs. The owner
  has added it; it authenticated on the paid dry run of 12 Nov 2026. The workflow only passes it to the
  pipeline when the run is meant to spend, and never prints it.
* `GITHUB_TOKEN`: provided automatically by Actions (commits and
  pending-review issues).
* `BRAVE_API_KEY` (optional secret): only for scheduled runs with
  `PIPELINE_SEARCH_PROVIDER=brave`.

Never commit keys. `.env.example` lists the local variables; `.env` is
git-ignored.

## API costs

**Measured once:** the paid dry run on GitHub on 12 Nov 2026 cost **$1.12**
by the run report's estimate at list prices: 40 web searches ($0.40, the
cap was reached) and about $0.72 of model tokens (40 search calls on Claude
Haiku 5.5, 16 extractions on Claude Opus 5.5). One run is one data point
(`docs/PIPELINE.md` §5 and §7).

Estimates at list prices made before that run (details and assumptions in
`docs/PIPELINE.md` §7):

* About **$1.1 per run**: roughly 30 web searches ($0.30), the search model's
  tokens (about $0.02) and about 10 extractions ($0.80).
* About **$2.2 a day** and **$65 a month** with the schedule on (two runs a day).
* Caps per run: 40 searches and 25 extractions, so a run is bounded at about
  $2.5 in normal use (about $17 in the theoretical worst case).
* To lower it: reduce `PIPELINE_MAX_EXTRACTIONS` or `PIPELINE_MAX_SEARCHES`,
  set extraction effort to `medium` in `pipeline/config.ts`, use
  `PIPELINE_SEARCH_PROVIDER=none` (loses the search fallbacks), or run once a
  day by removing one cron line.
* Every run report lists actual searches, tokens per model and the estimated
  cost.
* GitHub Pages and GitHub Actions are free for this public repository.

## Reviewing and correcting

* Held announcements are in `data/pending-review.json` (and, on live runs, as
  GitHub issues labelled `pending-review`). Resolve them with
  `npm run review -- list | show <id> | accept <id> | reject <id> --note "…"`.
* To correct an entry by hand, edit the JSON in a pull request and add a
  ChangeRecord. CI runs the validator.

Both are explained step by step in [`docs/REVIEW_GUIDE.md`](docs/REVIEW_GUIDE.md).

## Current limitations

* **No live run has written data yet.** Search and extraction have run
  against the Anthropic API once, as a dry run on GitHub (12 Nov 2026): the
  key worked, 22 of 33 sources were scanned, 16 documents extracted, 1
  change would have been published and 5 held. That run exposed four
  defects, now fixed with tests (`docs/PIPELINE.md` §5). Committing data and
  redeploying from a pipeline run has not happened yet (see
  `docs/ACCEPTANCE.md`, criterion 10).
* **The schedule is off** by the owner's choice until `SCHEDULE_ENABLED` is set.
* **Some sources block or defeat automated access**, so the pipeline relies on
  fallbacks (sitemaps, feeds, search) for them:
  * PCFC: news and circulars pages answer HTTP 403 (site search found 6
    documents on the paid dry run).
  * TECOM Group (tecomgroup.ae): HTTP 403 (the Dubai Industrial City site works).
  * Aldar: the news page answered HTTP 403 on 11 Nov and a JavaScript shell
    on 12 Nov (sitemap fallback both times).
  * WAM: listing is rendered by JavaScript, with no article links in the HTML
    (site search found 8 documents on the paid dry run).
  * DP World: listing is rendered by JavaScript (sitemap fallback, which has no publication dates).
  * Jafza: article pages sometimes return a bot-verification page, which is not bypassed.
  * Emirates media centre: the connection was reset on the probe.
  * The National: robots.txt disallows article pages (news sitemap used).
  * Not probed from the build container (outside its network allowlist):
    DHL, FedEx, UPS, DSV, CEVA, Aramex, Maersk, Arcapita, Dutco, Reuters,
    Zawya, Arabian Business, Logistics Middle East, Construction Week, Dubai
    Trade. Their listing URLs are unverified and most rely on search, which
    needs the paid search provider.
* Without a search provider (`none`), search-only sources cannot be scanned
  and are reported as failed, so a zero-spend run covers only the sources
  that can be fetched directly (14 of 33 on the GitHub runner on
  11 Nov 2026). Dubai Trade, WAM, DHL and DSV listings had no article links
  in their HTML on that run.
* Many figures have no stated measurement basis, so strict floor-space totals
  are lower than headline totals. This is intended.
