import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, blogWordCount } from "../content/blog";
import { BlogIndexPage, BlogPostPage } from "../pages/BlogPage";

describe("public GrantDeskHQ blog", () => {
  it("publishes two substantive, source-linked launch articles", () => {
    expect(BLOG_POSTS).toHaveLength(2);
    for (const post of BLOG_POSTS) {
      expect(blogWordCount(post)).toBeGreaterThan(250);
      expect(post.description.length).toBeGreaterThan(60);
      expect(post.sources.every((source) => source.url.startsWith("https://"))).toBe(true);
    }
  });

  it("renders a discoverable article with source links and a self-service CTA", () => {
    render(<MemoryRouter initialEntries={["/blog/post-award-grant-reporting-checklist"]}><Routes><Route path="/blog/:slug" element={<BlogPostPage />} /><Route path="/pricing" element={<div>Pricing</div>} /></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /post-award grant reporting checklist/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view self-service plans/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: /uniform administrative requirements/i })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  });

  it("renders both articles on the public index", () => {
    render(<MemoryRouter><BlogIndexPage /></MemoryRouter>);
    expect(screen.getAllByRole("link", { name: /read article/i })).toHaveLength(2);
  });
});
