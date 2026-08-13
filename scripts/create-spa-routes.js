import fs from "node:fs/promises";
import path from "node:path";

const distDirectory = path.resolve("dist");
const entryFile = path.join(distDirectory, "index.html");
const routes = {
  demo: {
    title: "GrantDeskHQ Demo | Source-linked grant reporting",
    description: "See how GrantDeskHQ turns a grant agreement, financial data, program results, and evidence into a source-linked post-award report workflow."
  },
  "sample-report": {
    title: "Sample Grant Report | GrantDeskHQ",
    description: "Explore a synthetic, source-linked grant report showing financial mappings, program results, evidence, and review controls."
  },
  pricing: {
    title: "GrantDeskHQ Pricing | Plans for nonprofit grant teams",
    description: "Compare Essentials, Growth, and Portfolio plans for AI-powered post-award grant reporting. Your first report is free."
  },
  assessment: {
    title: "Free First Grant Report | GrantDeskHQ",
    description: "Analyze your first post-award grant report free and see how much reporting work GrantDeskHQ can prepare from the files your team already has."
  },
  readiness: {
    title: "Free Grant Reporting Readiness Audit | GrantDeskHQ",
    description: "Audit one grant agreement free to identify reporting obligations, evidence needs, deadlines, and post-award workflow requirements."
  },
  privacy: {
    title: "Privacy and Data Handling | GrantDeskHQ",
    description: "Learn how GrantDeskHQ stores source files, processes selected report context, controls workspace access, and keeps AI-powered output reviewable."
  },
  compile: { noindex: true },
  login: { noindex: true },
  workspace: { noindex: true },
  gtm: { noindex: true },
  pilot: { noindex: true }
};

const sourceHtml = await fs.readFile(entryFile, "utf8");

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderRouteEntry(route, metadata) {
  const canonical = `https://grantdeskhq.com/${route}`;
  let html = sourceHtml;

  if (metadata.title) {
    const title = escapeAttribute(metadata.title);
    const description = escapeAttribute(metadata.description);
    html = html
      .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*>/s, `<meta name="description" content="${description}">`)
      .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`)
      .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*>/s, `<meta property="og:description" content="${description}">`)
      .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`)
      .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*>/s, `<meta name="twitter:description" content="${description}">`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
  }

  if (metadata.noindex) {
    html = html.replace("<meta name=\"theme-color\"", "<meta name=\"robots\" content=\"noindex, nofollow\">\n    <meta name=\"theme-color\"");
  }

  return html;
}

await Promise.all(Object.entries(routes).map(async ([route, metadata]) => {
  const routeDirectory = path.join(distDirectory, route);
  await fs.mkdir(routeDirectory, { recursive: true });
  await fs.writeFile(path.join(routeDirectory, "index.html"), renderRouteEntry(route, metadata));
}));

console.log(`Created direct-load entry files for ${Object.keys(routes).length} application routes.`);
