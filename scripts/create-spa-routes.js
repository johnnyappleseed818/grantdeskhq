import fs from "node:fs/promises";
import path from "node:path";
import { BLOG_POSTS } from "../src/content/blog.ts";

const distDirectory = path.resolve("dist");
const entryFile = path.join(distDirectory, "index.html");
const siteUrl = "https://grantdeskhq.com";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function link(pathname, label) {
  return `<a href="${pathname}">${escapeHtml(label)}</a>`;
}

function articleMarkup(post) {
  const sections = post.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>`).join("");
  const sources = post.sources.map((source) => `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a></li>`).join("");
  const related = BLOG_POSTS.filter((candidate) => candidate.slug !== post.slug).slice(0, 2).map((candidate) => `<li>${link(`/blog/${candidate.slug}`, candidate.title)}</li>`).join("");
  return `<main data-static-seo="true"><nav aria-label="Resource navigation">${link("/resources", "All resources")} · ${link("/blog", "Guides and articles")}</nav><article><p>${post.readingMinutes} minute read</p><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.description)}</p>${sections}<aside><h2>Ready to organize a real report?</h2><p>Try GrantDeskHQ with one award and keep your team in control of review and submission.</p>${link("/assessment", "Start your Free First Award")}</aside><section><h2>Related resources</h2><ul>${related}</ul></section><section><h2>Sources and further reading</h2><ul>${sources}</ul></section></article></main>`;
}

function articlePage(post) {
  const canonical = `${siteUrl}/blog/${post.slug}`;
  return {
    route: `blog/${post.slug}`,
    title: `${post.title} | GrantDeskHQ`,
    description: post.description,
    canonical,
    type: "article",
    markup: articleMarkup(post),
    schema: { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.description, datePublished: post.publishedAt, mainEntityOfPage: canonical, publisher: { "@type": "Organization", name: "GrantDeskHQ", url: siteUrl } }
  };
}

const resourceCards = BLOG_POSTS.map((post) => `<article><h2>${link(`/blog/${post.slug}`, post.title)}</h2><p>${escapeHtml(post.description)}</p><p>${post.resourceCategory === "checklist" ? "Checklist" : "Guide"} · ${post.readingMinutes} minute read</p></article>`).join("");
const pages = [
  { route: "", title: "GrantDeskHQ | AI-powered post-award grant reporting", description: "GrantDeskHQ turns grant agreements, accounting data, and program updates into source-linked funder-report drafts without messy spreadsheets.", canonical: `${siteUrl}/`, markup: `<main data-static-seo="true"><h1>Finish grant reports faster, without messy spreadsheets.</h1><p>GrantDeskHQ is an AI-powered post-award workflow for nonprofit finance, grants, and program teams. It turns grant agreements, accounting data, program updates, and supporting evidence into a reviewable funder-report draft.</p><p>${link("/assessment", "Start your Free First Award")} · ${link("/resources", "Explore post-award reporting resources")}</p></main>` },
  { route: "pricing", title: "GrantDeskHQ Pricing | Post-award reporting plans", description: "Choose the GrantDeskHQ workflow that fits your reporting needs and scale as your reporting needs grow.", canonical: `${siteUrl}/pricing`, markup: `<main data-static-seo="true"><h1>Choose the GrantDeskHQ workflow that fits your reporting needs.</h1><p>Choose the plan that fits your current grant workload and scale as your reporting needs grow.</p><h2>Monthly reporting plans</h2><p>GrantDeskHQ offers self-service plans for nonprofit reporting portfolios. Review current plan details and begin with one award when you are ready.</p><p>${link("/assessment", "Start your Free First Award")}</p></main>` },
  { route: "resources", title: "Post-Award Grant Reporting Resources | GrantDeskHQ", description: "Practical guides, templates, and checklists for nonprofit finance and grants teams managing post-award reporting.", canonical: `${siteUrl}/resources`, markup: `<main data-static-seo="true"><h1>Practical resources for post-award grant reporting</h1><p>Guides, templates, and checklists to help nonprofit finance and grants teams manage reporting after the award.</p>${resourceCards}<p>${link("/assessment", "Try GrantDeskHQ with one award")}</p></main>`, schema: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Post-Award Grant Reporting Resources", url: `${siteUrl}/resources`, mainEntity: { "@type": "ItemList", itemListElement: BLOG_POSTS.map((post, index) => ({ "@type": "ListItem", position: index + 1, name: post.title, url: `${siteUrl}/blog/${post.slug}` })) } } },
  { route: "blog", title: "Post-Award Grant Reporting Guidance | GrantDeskHQ", description: "Practical post-award reporting guidance for nonprofit finance, grants, and program teams.", canonical: `${siteUrl}/blog`, markup: `<main data-static-seo="true"><h1>Post-award reporting guidance for nonprofit teams</h1><p>Practical workflow guidance for nonprofit finance, grants, and program teams. General guidance never replaces the terms of a specific award.</p>${resourceCards}</main>` },
  { route: "assessment", title: "Free First Award | GrantDeskHQ", description: "Prepare one real award free with GrantDeskHQ before choosing a subscription.", canonical: `${siteUrl}/assessment`, markup: `<main data-static-seo="true"><h1>Prepare your first award free.</h1><p>Start with the award agreement, then add the budget, accounting data, program update, and evidence you have. GrantDeskHQ prepares a source-linked draft for your team to review.</p><p>No credit card or sales call is required for the first award.</p>${link("/compile?new=1", "Try your first award free")}</main>` },
  { route: "contact", title: "Contact and Feedback | GrantDeskHQ", description: "Contact GrantDeskHQ with product feedback, feature requests, billing questions, sales questions, partnerships, or support needs.", canonical: `${siteUrl}/contact`, markup: `<main data-static-seo="true"><h1>Contact and feedback</h1><p>Ask a question, report a problem, share product feedback, request a feature, discuss billing, sales, or partnerships.</p><p>The contact form is available without an account.</p></main>` },
  { route: "demo", title: "GrantDeskHQ Interactive Demo | Post-award reporting workflow", description: "Explore a synthetic demonstration of a source-linked post-award grant reporting workflow.", canonical: `${siteUrl}/demo`, markup: `<main data-static-seo="true"><h1>Explore the post-award reporting workflow</h1><p>This interactive demonstration uses synthetic data to show how GrantDeskHQ organizes award requirements, financial mappings, evidence, and review items.</p><p>${link("/assessment", "Try one award for free")}</p></main>` }
].concat(BLOG_POSTS.map(articlePage));

function pageSchema(page) {
  return page.schema || { "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: page.canonical, isPartOf: { "@id": `${siteUrl}/#website` } };
}

function renderPage(template, page) {
  const schema = JSON.stringify(pageSchema(page)).replace(/</g, "\\u003c");
  const description = `<meta name="description" content="${escapeHtml(page.description)}">`;
  const og = `<meta property="og:type" content="${page.type || "website"}">\n    <meta property="og:url" content="${escapeHtml(page.canonical)}">\n    <meta property="og:title" content="${escapeHtml(page.title)}">\n    <meta property="og:description" content="${escapeHtml(page.description)}">`;
  const twitter = `<meta name="twitter:card" content="summary">\n    <meta name="twitter:title" content="${escapeHtml(page.title)}">\n    <meta name="twitter:description" content="${escapeHtml(page.description)}">`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?>/i, description)
    .replace(/<meta\s+property="og:type"[\s\S]*?>\s*<meta\s+property="og:url"[\s\S]*?>\s*<meta\s+property="og:title"[\s\S]*?>\s*<meta\s+property="og:description"[\s\S]*?>\s*<meta\s+name="twitter:card"[\s\S]*?>\s*<meta\s+name="twitter:title"[\s\S]*?>\s*<meta\s+name="twitter:description"[\s\S]*?>/i, `${og}\n    ${twitter}`)
    .replace(/<link\s+rel="canonical"[\s\S]*?>/i, `<link rel="canonical" href="${escapeHtml(page.canonical)}">`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${schema}</script>`)
    .replace(/<div id="root" data-clarity-mask="true"><\/div>/, `<div id="root" data-clarity-mask="true">${page.markup}</div>`);
}

const template = await fs.readFile(entryFile, "utf8");
await Promise.all(pages.map(async (page) => {
  const outputFile = page.route ? path.join(distDirectory, page.route, "index.html") : entryFile;
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, renderPage(template, page));
}));

console.log(`Created static acquisition HTML and metadata for ${pages.length} public routes.`);
