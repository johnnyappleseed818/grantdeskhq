import { describe, expect, it } from "vitest";
import { resolveHunterOrganizationDomain, resolveHunterRoleFitContact } from "../../server/contactEnrichmentProviders.ts";

const base = { enabled: true, apiKey: "test", lookupLimit: 1, lookupsUsed: 0 };

describe("Hunter organization and role discovery", () => {
  it("resolves an organization domain without treating a discovery-source host as the organization domain", async () => {
    const resolution = await resolveHunterOrganizationDomain("Example Community Action", {
      ...base,
      fetcher: async () => new Response(JSON.stringify({ data: [{ domain: "example.org", company_name: "Example Community Action" }] }), { status: 200 })
    });
    expect(resolution).toEqual({ status: "FOUND", domain: "example.org", organization: "Example Community Action" });
  });

  it("selects only a named role-fit individual from Hunter Domain Search", async () => {
    const resolution = await resolveHunterRoleFitContact("example.org", /finance director/i, {
      ...base,
      fetcher: async () => new Response(JSON.stringify({ data: { emails: [
        { full_name: "Taylor Programs", position: "Program Manager" },
        { full_name: "Jordan Finance", position: "Finance Director" }
      ] } }), { status: 200 })
    });
    expect(resolution).toMatchObject({ status: "FOUND", person: { fullName: "Jordan Finance", title: "Finance Director" } });
  });

  it("keeps missing or unavailable Hunter responses out of contact eligibility", async () => {
    const missing = await resolveHunterRoleFitContact("example.org", /cfo/i, { ...base, fetcher: async () => new Response(JSON.stringify({ data: { emails: [] } }), { status: 200 }) });
    const unavailable = await resolveHunterOrganizationDomain("Example Community Action", { ...base, enabled: false });
    expect(missing.status).toBe("NOT_FOUND");
    expect(unavailable.status).toBe("UNAVAILABLE");
  });
});
