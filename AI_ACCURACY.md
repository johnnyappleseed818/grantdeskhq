# GrantDeskHQ AI accuracy release gate

GrantDeskHQ treats AI output as a draft and measures the complete guarded workflow, not the language model in isolation. A release passes only when the versioned synthetic evaluation scores **more than 95%** and has **zero critical fabrications**.

## Scoring

| Category | Weight |
| --- | ---: |
| Transaction fidelity to the uploaded ledger | 30% |
| Funder-rule extraction recall | 25% |
| Missing-information detection | 15% |
| Narrative factuality | 15% |
| Evidence and verifier completeness | 15% |

The benchmark includes 20 ledger transactions, exact award and category budgets, receipt and justification rules, the 10% variance threshold, the 200-word narrative limit, youth-served reporting, certification, missing evidence, current-period KPI values, and an adversarial document instruction.

Regardless of the numeric score, the run fails if the workflow:

- invents or omits a transaction;
- changes a ledger amount;
- introduces unsupported hotel costs;
- reports 120 or 150 youth served instead of the confirmed current-period value of 118;
- fails deterministic ledger or current-period fact checks; or
- returns an incomplete, duplicate, or invented verification finding.

## Run the live gate

The runner reads the OpenAI key directly from Secret Manager in the isolated GrantDeskHQ project and never writes it to disk:

```bash
npm run eval:ai
```

The account running the command needs access to `grantdeskhq-openai-key` in `grantdeskhq-proto-ek-2026`. The default evaluated configuration is `gpt-5.6-terra` for compilation and `gpt-5.6-luna` for independent verification.

## Interpretation

Passing this benchmark demonstrates performance above 95% on the checked-in synthetic workflow. It is a release criterion, not a promise of universal accuracy on every possible funder document. Production outputs remain source-linked drafts requiring professional review, and new anonymized failure patterns should be added to the evaluation set before prompt or model changes are released.
