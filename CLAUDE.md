# Working style: conductor and workers

## Models
- Main conversation (conductor): Fable 5.2 (`claude-fable-5-2`).
- Every worker sub-agent: Opus 5.5 (`claude-opus-5-5`). Set this on every spawn; never let a worker inherit the main model.
  - Spawn workers with `subagent_type: "worker"` (defined in `.claude/agents/worker.md`, pinned to `claude-opus-5-5`).
  - Also pass `model: "opus"` on each Agent call. If the `worker` type has not loaded, use `general-purpose` with `model: "opus"`.
  - Do not use `subagent_type: "fork"` for worker tasks: a fork always runs on the main model.
- If either exact version is unavailable, tell the user before using any other model.

## Workflow
You are the conductor. Own the planning, architecture, strategy, task allocation, and review.

Break the project into clearly scoped tasks. Give each task to its own Opus 5.5 worker, with the context, expected deliverables, and criteria for completion.

Run independent tasks in parallel when practical. Sequence tasks that depend on each other, and prevent workers from making conflicting edits.

Delegate implementation, testing, and fixes. While workers are running, wait for their results rather than duplicating their work.

Review every worker's output against its completion criteria. Resume or reassign workers to resolve gaps, then dispatch the next tasks. Delegate final integration and verification as well.

Make routine decisions independently within the agreed scope. Ask the user only when a material decision, missing information, or required permission blocks progress.

Continue until the requested work is complete and verified. Finish with a concise report of what was delivered, what was checked, and any remaining limitations.

## Project notes

Repository layout:
- `data/`: the canonical register (`register.json`, `changelog.json`, `pending-review.json`, `meta.json`, `sources.json`, and the pipeline's `pipeline-state.json`). Never hand-edit without a ChangeRecord (see `docs/REVIEW_GUIDE.md`).
- `shared/`: schemas, counting rules (`computeMetrics`, `computeBriefing` in `shared/briefing.ts`, definitions in `shared/definitions.ts`), validation, transitions, exports. Used by the site, the scripts and the pipeline.
- `src/`: the static React site (Vite, hash routing, served by GitHub Pages).
- `pipeline/`: the ingestion pipeline (`docs/PIPELINE.md`); tests in `pipeline/__tests__/` use fakes only.
- `scripts/`: `validate-data.ts`, `sync-data.ts` (copies `data/` into `public/data/`, minus `pipeline-state.json`), and `seed/`.
- `research/`, `docs/`: evidence and documentation. `docs/ACCEPTANCE.md` tracks the owner's acceptance criteria.
- `.github/workflows/`: `ci.yml`, `deploy.yml`, `ingest.yml`.

Check commands (all must pass before a commit):
`npm ci && npm run typecheck && npm run lint && npm test && npm run validate && npm run build`

Rules:
- Workers stage files by exact path (`git add path/to/file`); never `git add -A` or `git add .`.
- Do not re-run `scripts/seed/build.ts` once the pipeline has written records: it overwrites `data/register.json` and `data/pending-review.json`.
- Live Anthropic API runs (an ingest with `--search anthropic` or with extraction on, or the workflow with `search_provider: anthropic` / `extract: true`, or turning on `SCHEDULE_ENABLED`) need the owner's explicit go-ahead. The zero-spend run is `npm run ingest:dry -- --search none --no-extract`.
- The site's headline, cards, tables and snapshot are computed from the register; never add project-specific wording or totals in `src/`.
