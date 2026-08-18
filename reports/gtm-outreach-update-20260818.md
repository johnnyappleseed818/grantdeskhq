# GTM outreach reconciliation — 2026-08-18

## Recorded facts

- Added one human-confirmed direct `SENT` event each for Project Oceanology (`award-project-oceanology-2026`) and Rodale Institute (`job-rodale-2026`), both date-confirmed as 2026-08-18. No send time, delivery result, response, trial, conversion, or follow-up date was invented.
- Preserved the original Junior Achievement of South Florida 2026-08-17 event and known recipient `info@jasouthflorida.org`; no second initial-outreach event was created.
- Canonical totals: 7 direct unique organizations, 5 partner unique organizations, 12 total unique organizations, and 12 sent events.

## Reconciliation guard

Every ledger record has `DO_NOT_SEND_NEW_INITIAL_OUTREACH`. The reusable guard blocks a new initial candidate when its canonical organization identity or known recipient email matches a prior initial record. Control Plane receives both identity and recipient exclusions, retaining later source signals as `ALREADY_CONTACTED`. A follow-up remains a separate human-authorized event and no date is proposed. Null follow-up dates render as `Not yet configured`.

## Boundary

This update only records provided human-confirmed history and reconciliation metadata. It performs no send, scheduling, enrichment, delivery lookup, deployment, billing, or other external action.
