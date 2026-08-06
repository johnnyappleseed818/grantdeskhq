import fs from "node:fs/promises";
import path from "node:path";

const distDirectory = path.resolve("dist");
const entryFile = path.join(distDirectory, "index.html");
const routes = ["demo", "compile", "login", "workspace", "sample-report", "privacy", "pricing", "assessment", "pilot"];

await Promise.all(routes.map(async (route) => {
  const routeDirectory = path.join(distDirectory, route);
  await fs.mkdir(routeDirectory, { recursive: true });
  await fs.copyFile(entryFile, path.join(routeDirectory, "index.html"));
}));

console.log(`Created direct-load entry files for ${routes.length} application routes.`);
