import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public structured data", () => { it("publishes factual Organization and WebSite entities", () => { const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8"); const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/); expect(match).not.toBeNull(); const graph = JSON.parse(match![1])["@graph"]; expect(graph.map((entity: { "@type": string }) => entity["@type"])).toEqual(["Organization", "WebSite"]); expect(graph[0]).toMatchObject({ name: "GrantDeskHQ", url: "https://grantdeskhq.com/" }); expect(graph[1].publisher["@id"]).toBe("https://grantdeskhq.com/#organization"); expect(JSON.stringify(graph)).not.toMatch(/review|rating|price|citation/i); }); });
