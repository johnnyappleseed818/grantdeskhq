import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, blogWordCount, findBlogPost } from "../content/blog";
import { BlogIndexPage, BlogPostPage } from "../pages/BlogPage";
import { ResourcesPage } from "../pages/ResourcesPage";

describe("public GrantDeskHQ blog", () => {
  it("publishes six substantive, source-linked articles", () => {
    expect(BLOG_POSTS).toHaveLength(6);
    for (const post of BLOG_POSTS) {
      expect(blogWordCount(post)).toBeGreaterThan(250);
      expect(post.description.length).toBeGreaterThan(60);
      expect(post.sources.every((source) => source.url.startsWith("https://"))).toBe(true);
    }
    const overnightPages = BLOG_POSTS.filter((post) => ["turn-grant-agreement-into-reporting-plan", "grant-progress-report-workflow", "grant-closeout-checklist", "post-award-grant-management-software"].includes(post.slug));
    expect(overnightPages).toHaveLength(4);
    expect(overnightPages.every((post) => blogWordCount(post) > 400)).toBe(true);
    const staticRoutes = fs.readFileSync(path.resolve("scripts/create-spa-routes.js"), "utf8");
    expect(staticRoutes).toContain("BLOG_POSTS.map(articlePage)");
    expect(staticRoutes).toContain("route: `blog/${post.slug}`");
  });

  it("renders a discoverable article with source links and a self-service CTA", () => {
    render(<MemoryRouter initialEntries={["/blog/post-award-grant-reporting-checklist"]}><Routes><Route path="/blog/:slug" element={<BlogPostPage />} /><Route path="/pricing" element={<div>Pricing</div>} /></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /post-award grant reporting checklist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start your free first award/i })).toHaveAttribute("href", "/assessment");
    expect(screen.getByRole("link", { name: /view self-service plans/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: /uniform administrative requirements/i })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
    expect(screen.getByRole("link", { name: "All resources" })).toHaveAttribute("href", "/resources");
  });

  it("sets canonical, OpenGraph, and Article metadata per article", () => {
    render(<MemoryRouter initialEntries={["/blog/budget-to-actual-grant-reporting-workflow"]}><Routes><Route path="/blog/:slug" element={<BlogPostPage />} /></Routes></MemoryRouter>);
    const property = (name: string) => Array.from(document.querySelectorAll<HTMLMetaElement>("meta[property]")).find((element) => element.getAttribute("property") === name)?.getAttribute("content");
    expect(document.title).toMatch(/budget-to-actual grant reporting/i);
    expect(property("og:type")).toBe("article");
    expect(property("og:url")).toBe("https://grantdeskhq.com/blog/budget-to-actual-grant-reporting-workflow");
    expect(property("article:published_time")).toBe("2026-08-16");
    expect(document.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe("https://grantdeskhq.com/blog/budget-to-actual-grant-reporting-workflow");
  });

  it.each([
    ["turn-grant-agreement-into-reporting-plan", /turn a grant agreement into a practical reporting plan/i],
    ["grant-progress-report-workflow", /grant progress report workflow/i],
    ["grant-closeout-checklist", /grant closeout checklist/i],
    ["post-award-grant-management-software", /post-award grant management software/i]
  ])("publishes the candidate route %s with unique metadata and internal links", (slug, heading) => {
    render(<MemoryRouter initialEntries={["/blog/" + slug]}><Routes><Route path="/blog/:slug" element={<BlogPostPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(findBlogPost(slug)?.description);
    expect(document.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe("https://grantdeskhq.com/blog/" + slug);
    expect(screen.getByRole("link", { name: "All resources" })).toHaveAttribute("href", "/resources");
    expect(screen.getByRole("link", { name: /start your free first award/i })).toHaveAttribute("href", "/assessment");
  });

  it("renders only published resources on the public Resources hub", () => {
    render(<MemoryRouter><ResourcesPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Practical resources for post-award grant reporting" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Guides & articles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Templates & checklists" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /How to make budget-to-actual grant reporting reviewable/i })).toHaveAttribute("href", "/blog/budget-to-actual-grant-reporting-workflow");
    expect(screen.getByRole("link", { name: /practical post-award grant reporting checklist/i })).toHaveAttribute("href", "/blog/post-award-grant-reporting-checklist");
    expect(screen.getByRole("link", { name: "Try GrantDeskHQ with one award" })).toHaveAttribute("href", "/assessment");
    expect(document.title).toBe("Post-Award Grant Reporting Resources | GrantDeskHQ");
    expect(document.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe("https://grantdeskhq.com/resources");
  });

  it("renders both articles on the public index", () => {
    render(<MemoryRouter><BlogIndexPage /></MemoryRouter>);
    expect(screen.getAllByRole("link", { name: /read article/i })).toHaveLength(6);
  });
});
