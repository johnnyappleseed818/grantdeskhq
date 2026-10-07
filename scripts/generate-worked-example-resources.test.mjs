import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateWorkedExampleResources, verifyWorkedExampleResources } from "./generate-worked-example-resources.mjs";

test("creates a formula-based synthetic report packet with exact reconciled totals", async () => {
  const destination = await mkdtemp(path.join(tmpdir(), "grantdeskhq-worked-example-"));
  try {
    const result = await generateWorkedExampleResources(destination);
    const verification = await verifyWorkedExampleResources(destination);
    assert.equal(result.totals.raw, 57200);
    assert.equal(result.totals.actual, 55200);
    assert.equal(verification.fileCount, 11);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
