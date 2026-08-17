# Router category precedence validation

Task: `router-standard-category-precedence-20260817`

The router now evaluates explicit `standard_categories` before broader
`routine_categories`. This keeps `GTM_UI` on STANDARD even though it contains
the routine-category token `GTM`.

Focused regression coverage verifies these deterministic routes:

- `GTM_UI`, `UI`, and `FRONTEND`: STANDARD / gpt-5.6-terra / medium.
- `GTM_RECONCILIATION`: ROUTINE / gpt-5.6-luna / low.

Validation command: `npm run test:agent-routing`
