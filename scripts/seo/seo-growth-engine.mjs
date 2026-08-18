import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITE = "https://grantdeskhq.com";
const REQUIRED_QUALITY = ["sources", "Free First Award", "review", "award terms"];
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const text = (file) => readFileSync(file, "utf8");
const absolute = (root, pathname) => resolve(root, pathname);
const issue = (id, detail) => ({ id, detail });

export function scoreOpportunity(opportunity) {
  const factors = opportunity.priority_factors || {};
  return ["intent_fit", "product_fit", "differentiation", "conversion_path", "freshness_need"]
    .reduce((total, key) => total + Number(factors[key] || 0), 0);
}

export function inventory(root, queue) {
  const blog = text(absolute(root, "src/content/blog.ts"));
  const sitemap = text(absolute(root, "public/sitemap.xml"));
  return queue.opportunities.filter((item) => item.existing_page).map((item) => ({
    id: item.id,
    url: item.canonical_url,
    lifecycle_status: item.lifecycle_status,
    score: scoreOpportunity(item),
    in_blog_source: blog.includes(`slug: "${item.canonical_url.split("/").at(-1)}"`),
    in_sitemap: sitemap.includes(`<loc>${SITE}${item.canonical_url}</loc>`),
    last_reviewed_at: item.last_reviewed_at,
    next_refresh_due_at: item.next_refresh_due_at
  })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function checkTechnical(root, queue) {
  const problems = [];
  const robots = text(absolute(root, "public/robots.txt"));
  const sitemap = text(absolute(root, "public/sitemap.xml"));
  const blogPage = text(absolute(root, "src/pages/BlogPage.tsx"));
  const staticRoutes = text(absolute(root, "scripts/create-spa-routes.js"));
  if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) problems.push(issue("robots-sitemap", "robots.txt must reference the canonical sitemap."));
  if (!robots.includes("User-agent: *") || !robots.includes("Allow: /")) problems.push(issue("robots-indexability", "robots.txt must allow public crawling."));
  if (robots.toLowerCase().includes("disallow: /")) problems.push(issue("robots-blocking", "robots.txt cannot block the public site."));
  if (!blogPage.includes("link[rel=canonical]") || !blogPage.includes("canonicalUrl")) problems.push(issue("article-canonical", "Article pages must set a canonical URL."));
  if (!staticRoutes.includes("articlePage(post)") || !staticRoutes.includes("data-static-seo=\"true\"")) problems.push(issue("static-content", "Static generation must include article content."));
  for (const item of queue.opportunities.filter((entry) => entry.existing_page)) if (!sitemap.includes(`<loc>${SITE}${item.canonical_url}</loc>`)) problems.push(issue("sitemap-url", `Missing ${item.canonical_url} from sitemap.`));
  return problems;
}

function checkContent(root, queue) {
  const problems = [];
  const blog = text(absolute(root, "src/content/blog.ts"));
  const blogPage = text(absolute(root, "src/pages/BlogPage.tsx"));
  for (const item of queue.opportunities.filter((entry) => entry.existing_page)) {
    const slug = item.canonical_url.split("/").at(-1);
    if (!blog.includes(`slug: "${slug}"`)) problems.push(issue("content-url", `${item.canonical_url} is queued as existing but is not in BLOG_POSTS.`));
  }
  for (const phrase of REQUIRED_QUALITY) if (!blog.toLowerCase().includes(phrase.toLowerCase())) problems.push(issue("content-precondition", `Blog content lacks required quality phrase: ${phrase}.`));
  for (const phrase of ["All resources", "Guides and articles", "Start your Free First Award", "Related resources", "Sources and further reading"]) if (!blogPage.includes(phrase)) problems.push(issue("internal-link", `Article rendering lacks required internal-link or source treatment: ${phrase}.`));
  return problems;
}

function checkEvaluation(queue, evaluation) {
  const problems = [];
  const known = new Set(["/", "/resources", ...queue.opportunities.filter((item) => item.existing_page).map((item) => item.canonical_url)]);
  if (!Array.isArray(evaluation.queries) || evaluation.queries.length !== 20) problems.push(issue("ai-query-count", "AI-search evaluation must contain exactly 20 query targets."));
  for (const entry of evaluation.queries || []) {
    if (!entry.query || !entry.target_page) problems.push(issue("ai-query-shape", "Each AI-search entry requires query and target_page."));
    else if (!known.has(entry.target_page)) problems.push(issue("ai-query-target", `${entry.query} targets an unknown or unpublished URL: ${entry.target_page}.`));
  }
  return problems;
}

export function validateSeoEngine(root, { queuePath = "ops/seo-content-queue.json", evaluationPath = "ops/ai-search-evaluation.json", schedulePath = "ops/seo-schedule.json" } = {}) {
  const queue = readJson(absolute(root, queuePath));
  const evaluation = readJson(absolute(root, evaluationPath));
  const schedule = readJson(absolute(root, schedulePath));
  const problems = [];
  if (queue.publication?.enabled !== false) problems.push(issue("publication-lock", "Initial SEO engine must keep publication disabled."));
  if (queue.selection?.require_explicit_ids !== true || queue.selection?.max_opportunities_per_run !== 1) problems.push(issue("selection-bound", "Runner must require explicit IDs and select at most one opportunity."));
  const duplicateUrls = queue.opportunities.map((item) => item.canonical_url).filter((url, index, list) => list.indexOf(url) !== index);
  if (duplicateUrls.length) problems.push(issue("cannibalization", `Duplicate canonical URLs: ${[...new Set(duplicateUrls)].join(", ")}.`));
  for (const item of queue.opportunities) if (!item.search_intent || !item.coverage || !item.evidence?.length || !item.cannibalization_risk || !item.lifecycle_status || !item.overlap_guard) problems.push(issue("opportunity-shape", `${item.id} lacks required opportunity metadata.`));
  if (schedule.cadence !== "twice_weekly" || schedule.schedule?.length !== 2 || schedule.calendar_trigger?.system !== "ChatGPT Scheduled UI" || schedule.calendar_trigger?.creation !== "MANUAL_REQUIRED") problems.push(issue("schedule", "Schedule must be twice weekly and require the ChatGPT Scheduled UI."));
  problems.push(...checkTechnical(root, queue), ...checkContent(root, queue), ...checkEvaluation(queue, evaluation));
  return { status: problems.length ? "FAIL" : "PASS", problems, inventory: inventory(root, queue), evaluated_queries: evaluation.queries.length, publishing_enabled: queue.publication.enabled };
}

export function selectExplicitOpportunity(root, id) {
  const queue = readJson(absolute(root, "ops/seo-content-queue.json"));
  if (!id) throw new Error("An explicit SEO opportunity ID is required.");
  const item = queue.opportunities.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown SEO opportunity: ${id}.`);
  if (!queue.selection.eligible_lifecycle_statuses.includes(item.lifecycle_status)) throw new Error(`${id} is not eligible; lifecycle status is ${item.lifecycle_status}.`);
  return { ...item, score: scoreOpportunity(item), publishing_enabled: queue.publication.enabled };
}

export function requiredFilesExist(root) {
  return ["ops/seo-content-queue.json", "ops/ai-search-evaluation.json", "ops/seo-schedule.json"].every((file) => existsSync(absolute(root, file)));
}
