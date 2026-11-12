# Dubai Logistics Investment Tracker: proof-of-concept summary

Status on 13 November 2026: **proof of concept. The automatic schedule is
off by the owner's decision.** Detailed evidence is in `docs/ACCEPTANCE.md`;
pipeline details and measured runs are in `docs/PIPELINE.md`.

## What exists

* **A source-verified register** of 31 logistics and warehousing projects in
  Dubai (`data/register.json`). It was built from the owner's November 2026
  briefing and audited against public sources. Every project has a status
  history, and every figure carries its evidence link and how it was seen
  (page read directly, or search result only). Every change is logged with
  its evidence.
* **A public website** (GitHub Pages) whose headline, cards, tables and
  exports are all computed from the register by the same tested rules:
  "In 2026, 11 logistics facilities opened in Dubai and 3 more completed
  construction." Floor space is shown by measurement basis (GFA, GLA,
  built-up, basis not stated) and never mixed with land or yard areas. Grade A
  is counted only where a developer or official source says so.
* **An update pipeline** that scans 32 public sources: free zones, ports,
  government media, operators and newspapers. It reads new articles,
  extracts candidate facts with Claude Opus 5.5, and checks every quote,
  number, date and area basis against the page text in code. It then either
  publishes a change, with a change record, or holds it for human review as a
  GitHub issue. It never invents data and never reports "nothing new" when a
  source could not be read.
* **A GitHub workflow** that runs the pipeline, validates the data, commits
  it and redeploys the site. It is off by default and costs nothing unless a
  paid run is chosen.
* **Tests and checks:** 242 automated tests, a data validator and CI on every
  change.

## What was shown live

* Three paid runs on GitHub on 12 November 2026 (two dry runs and one live
  run). The API key worked, and every enabled source was scanned on the
  live run (blocked sites through site search or sitemaps).
* The live run went end to end: scan, extract, check, decide, validate, commit
  and redeploy the site. It **published nothing and held 14 claims for
  review**, each with a GitHub issue. All 14 were rejected in review: 10 were
  outside Dubai or not facilities, 3 were projects already in the register
  and 1 was too vague.
* Safety: across three runs the pipeline made **one wrong publish decision**
  (dry run 1: a half-year results report read as an opening). It was fixed
  before any live run and has not recurred. No wrong data has reached the
  register.

## What was not shown

* **No pipeline-made change to the register yet.** Nothing new and
  publishable appeared in the test window, so "a new official opening
  updates the site's totals" is proven only with simulated articles.
* **No scheduled run**: the schedule is off by the owner's decision.
* The noise-reduction and cost changes of 13 November 2026 are tested
  offline only. These are: setting aside claims outside the UAE or not about
  facilities, keeping other-emirate claims as regional mentions, merging the
  same story from two outlets, and switching off search-only sources.

## Cost (Anthropic API, list prices; GitHub hosting is free)

| | Per run | 1 run a day (30 days) | 2 runs a day (30 days) |
|---|---|---|---|
| Measured, 12 Nov 2026 (3 runs: $1.12, $1.11, $1.10) | **$1.10** | ≈ $33 | ≈ $66 |
| After the search change of 13 Nov 2026 (**estimate**, not yet confirmed by a paid run) | **≈ $0.86** | ≈ $26 | ≈ $52 |

About three quarters of the cost is the extraction model (≈ $0.04 per
article read). Search was the other quarter until the change; in three runs
the search-only sources produced nothing that reached extraction.

## Main risks

* **Sources that block automated reading.** PCFC and Aldar answer HTTP 403
  or JavaScript shells, WAM's listing has no links, Jafza sometimes shows a
  bot check, and Reuters is refused by the search tool. The pipeline falls
  back to sitemaps and site search, and never bypasses a block. Coverage is
  therefore not exhaustive, and private or unannounced projects are often
  missing.
* **Areas without a stated basis.** For 15 of 31 projects, every area figure
  lacks a stated basis (floor, plot or land). Strict floor-space totals are
  therefore much lower than headline figures in the press. This is
  deliberate, but it limits the precision of any total.
* **Search-indexed evidence.** 6 projects rest only on search-result
  snippets, because their pages could not be read, and 11 cite at least one
  such source. These are flagged on the site and never published
  automatically.
* **Review load.** Every held claim needs a person. After the 13 Nov
  changes, the expected load is a few items per run instead of about a
  dozen; this is still to be confirmed live.

## What a funded next phase would do

1. Confirm the 13 November changes with one paid run, then turn on one run a
   day (≈ $26 a month, estimate) with a weekly human review of held items.
2. Raise coverage of the blocking sources: agreements or feeds from PCFC,
   Dubai South, Jafza and DP World, or a licensed news API, in place of
   search.
3. Fill the measurement gaps: ask developers for the area basis and Grade A
   specifications of the largest projects, and replace search-only evidence
   with readable sources.
4. Add the regional-context projects the pipeline lists (Abu Dhabi,
   Sharjah, northern emirates) by hand, if the scope is widened beyond
   Dubai.
5. Add alerts: a short weekly email of what changed, what is held and what
   could not be read.
