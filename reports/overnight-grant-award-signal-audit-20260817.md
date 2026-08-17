# Overnight grant-award signal audit

The deterministic USAspending scan now records `scanStatus`, `lastSuccessfulScanAt`, `source`, `newAwardCount`, `duplicateCount`, and `errorCount`. A successful empty result is reported as `no_new_awards`; transport/API failures still throw and are therefore distinguishable from an empty scan. Duplicate award records are counted by `generated_internal_id` before candidate ranking and limiting.

No LLM parsing, email enrichment, contact discovery, or outbound activity was added.

Validation: `npm exec vitest run src/test/gtmAwardScanner.test.ts src/test/gtm.test.tsx` — 23 tests passed.
