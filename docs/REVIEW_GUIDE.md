# Review guide

How to handle announcements that the pipeline held back, and how to correct
the register by hand without breaking its audit trail.

## Why an item is held

The pipeline publishes only what it can prove from the page text: the rules
are in `docs/PIPELINE.md` §3.7. Anything else becomes an **open item** in
`data/pending-review.json`. Each item has:

* `kind`:
  * `new_project`: a project not in the register.
  * `update`: a new milestone or value for an existing project.
  * `conflict`: the evidence disagrees with the register (a different area or
    investment, or a backward status).
* `reasonHeld`: every reason, in plain words. Typical reasons:
  * `single secondary source …`: only one media report; no official page and no second independent source.
  * `grounding: … quote not found in the page text`: the extracted claim could not be found verbatim on the page.
  * `identity ambiguous: possible matches …`: it may be one of several existing projects.
  * `… conflicts with the register …`: the figures disagree.
  * `emirate not stated in the source`, or `the text mentions area figures that were not extracted`.
* `evidence`: the URL, its publication date and the key quote.
* `proposed`: what would be written. For `update` and `conflict` it is a map
  of field → value (keys ending in `[+]` append, e.g. `events[+]`). For
  `new_project` it holds `project`, a complete draft record, when one could be
  built. Keys starting with `_` are context for you (`_fact` holds the raw
  extraction, `_document` the source, `_possibleMatches` the candidates) and
  are never applied.
* `issueUrl`: the GitHub issue opened for it (label `pending-review`), when the pipeline had a token.

## Reviewing an item

1. Open the evidence URL. Read the page and check the quote is there and means what the item says.
2. Look for the **official** announcement (developer, free zone, government
   media office). If you find one, use it as the evidence: it is stronger than
   a media report.
3. Decide:
   * **Accept**: the claim is right and adds to the register.
   * **Accept after editing**: mostly right, but needs a fix (wrong project, wrong basis, missing date). Edit by hand (below).
   * **Reject**: wrong, out of scope, a duplicate, or too vague. Always give a reason.

### With the `review` command

```bash
npm run review -- list                       # open items with their reasons
npm run review -- show rev-20261111-1a2b3c4d # the full item as JSON
npm run review -- accept rev-20261111-1a2b3c4d --note "Confirmed on the Dubai South newsroom" \
     --verification verified_official
npm run review -- reject rev-20261111-1a2b3c4d --note "Same facility as acme-jafza-cold-store; already recorded"
```

What `accept` does:

* It applies the proposal through the **same code path** as the pipeline,
  with `appliedBy: "manual"`. One ChangeRecord is written per changed field,
  and the evidence URL and date come from the item.
* `--verification` records how well you verified it: `verified_official`,
  `verified_multiple`, `indexed_only` or `unverified`. The default is derived
  from the source (an official page read directly gives `verified_official`;
  anything else gives `unverified`), so pass it explicitly when you checked
  more.
* It marks the item `accepted` with `resolvedAt` and your note.
* It runs `validateRegister` on the result and **writes nothing if anything
  fails**; the errors are printed.
* A `new_project` item without a complete `project` draft cannot be accepted
  this way. Add the project by hand (below), then reject the item with a note
  pointing to the new project id.

`reject` marks the item `rejected` with your note. It changes nothing else
and the item stays in the file as history.

Then review the diff (`git diff data/`), commit and open a pull request. CI runs `npm run validate`.

### Without the command: editing JSON in a pull request

1. In `data/pending-review.json`, set `"state": "accepted"` or `"rejected"`,
   add `"resolvedAt": "2026-11-12T08:00:00Z"` (ISO with offset) and a
   `"resolutionNote"`.
2. For an accept, make the change in `data/register.json` yourself and add the
   ChangeRecords to `data/changelog.json` (next section).
3. Run `npm run validate` locally. CI runs it on the pull request too.

When the item has an issue, close it with a link to the pull request.

## Correcting a data entry by hand

Every change to the register needs a ChangeRecord in `data/changelog.json`:

```json
{
  "id": "chg-20261112-manual01",
  "projectId": "acme-logistics-jafza-cold-store",
  "field": "areas[0].valueM2",
  "previousValue": 20000,
  "newValue": 18580.61,
  "evidenceUrl": "https://www.jafza.ae/resource-centre/media/news/…",
  "evidenceDate": "2026-11-09",
  "reason": "Press release gives 200,000 sq ft, not 20,000 m²",
  "verificationStatus": "verified_official",
  "appliedAt": "2026-11-12T08:00:00Z",
  "appliedBy": "manual"
}
```

Rules:

* **Never delete a project** or reuse its id. Mark it `cancelled` (with a
  `cancelled` event), or fix it with a `correction` event (which may carry
  `statusAfter` to move a status backwards).
* Keep `status` consistent with `events`; the validator replays them. Keep
  `latestMilestone` equal to the newest event (same date and URL). Update
  `lastVerified` and `updatedAt`.
* Areas: keep the source's own figure in `originalValue` and `originalUnit`,
  convert exactly to `valueM2` (1 sq ft = 0.09290304 m²), and choose the
  **basis** the source states. Land, yard and district areas never go in
  `warehouse_gfa` or `gla`.
* Never set `actualCompletion` from a forecast. It needs a source published on or after the completion.
* Add every cited URL to the project's `sources`.
* Ids: use any unique `chg-…` id; `makeChangeId` in `shared/ids.ts` gives the canonical form.

## How validation protects the register

`npm run validate` (and `validateRegister`, which the pipeline and `review`
run before writing) rejects, among other things:

* duplicate ids and events;
* statuses that do not match the events;
* backward transitions without a correction;
* delivered projects without a sourced `actualCompletion`;
* forecasts promoted to actuals;
* unsourced areas or investments, and wrong unit or AED conversions;
* changelog or review entries pointing at unknown projects.

The validator **warns** about probable duplicates, mixed-basis areas and
stale forecasts.

The pipeline will not write if validation fails. The scheduled workflow
commits only after `npm run validate` passes. A pull request that breaks
validation fails CI. The site shows only what passed.
