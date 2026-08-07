import { spawnSync } from "node:child_process";

const projectId = "grantdeskhq-proto-ek-2026";
const secret = spawnSync(
  "gcloud",
  ["secrets", "versions", "access", "latest", "--secret=grantdeskhq-openai-key", `--project=${projectId}`],
  { encoding: "utf8" }
);

if (secret.status !== 0 || !secret.stdout.trim()) {
  process.stderr.write(secret.stderr || "Could not access the GrantDeskHQ OpenAI secret.\n");
  process.exit(secret.status || 1);
}

const evaluation = spawnSync(
  "npx",
  ["vitest", "run", "--disableConsoleIntercept", "src/test/compiler.accuracy-evaluation.test.ts"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPENAI_API_KEY: secret.stdout.trim(),
      OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      OPENAI_VERIFIER_MODEL: process.env.OPENAI_VERIFIER_MODEL || "gpt-5.6-luna",
      RUN_AI_EVAL: "1"
    },
    stdio: "inherit"
  }
);

process.exit(evaluation.status ?? 1);
