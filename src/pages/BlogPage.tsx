import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { BLOG_POSTS, findBlogPost } from "../content/blog";

function setHeadMeta(attribute: "name" | "property", key: string, value: string) {
  const selector = "meta[" + attribute + "='" + key + "']";
  const existing = document.querySelector<HTMLMetaElement>(selector);
  const meta = existing || document.createElement("meta");
  meta.setAttribute(attribute, key);
  meta.setAttribute("content", value);
  if (!existing) document.head.appendChild(meta);
}

export function BlogIndexPage() {
  return <section className="workspace-page"><div className="site-shell py-12"><p className="eyebrow">GrantDeskHQ field guide</p><h1 className="page-title">Post-award reporting guidance for nonprofit teams</h1><p className="mx-auto max-w-3xl text-lg text-slate-600">Practical workflow guidance for nonprofit finance, grants, and program teams. General guidance never replaces the terms of a specific award.</p><div className="mt-10 grid gap-6 md:grid-cols-2">{BLOG_POSTS.map((post) => <article className="panel p-6" key={post.slug}><p className="eyebrow">{post.readingMinutes} minute read</p><h2 className="mt-3 text-2xl font-bold text-slate-900"><Link className="underline" to={"/blog/" + post.slug}>{post.title}</Link></h2><p className="mt-3 text-slate-600">{post.description}</p><Link className="button button-secondary mt-5" to={"/blog/" + post.slug}>Read article</Link></article>)}</div></div></section>;
}

export function BlogPostPage() {
  const { slug } = useParams();
  const post = findBlogPost(slug);
  useEffect(() => {
    if (!post) return;
    const canonicalUrl = "https://grantdeskhq.com/blog/" + post.slug;
    document.title = (post.seoTitle || post.title) + " | GrantDeskHQ";
    setHeadMeta("name", "description", post.description);
    setHeadMeta("property", "og:type", "article");
    setHeadMeta("property", "og:title", post.seoTitle || post.title);
    setHeadMeta("property", "og:description", post.description);
    setHeadMeta("property", "og:url", canonicalUrl);
    setHeadMeta("property", "article:published_time", post.publishedAt);
    if (post.updatedAt) setHeadMeta("property", "article:modified_time", post.updatedAt);
    const canonical = document.querySelector("link[rel=canonical]") || document.head.appendChild(Object.assign(document.createElement("link"), { rel: "canonical" }));
    canonical.setAttribute("href", canonicalUrl);
  }, [post]);
  if (!post) return <section className="workspace-page"><div className="site-shell py-16"><h1 className="page-title">Article not found</h1><Link className="button button-primary mt-6" to="/blog">View the field guide</Link></div></section>;
  const relatedPosts = BLOG_POSTS.filter((candidate) => candidate.slug !== post.slug).sort((a, b) => Number(b.resourceCategory === post.resourceCategory) - Number(a.resourceCategory === post.resourceCategory)).slice(0, 2);
  const articleSchema = { "@context": "https://schema.org", "@type": "Article", headline: post.seoTitle || post.title, description: post.description, datePublished: post.publishedAt, ...(post.updatedAt ? { dateModified: post.updatedAt } : {}), mainEntityOfPage: "https://grantdeskhq.com/blog/" + post.slug, publisher: { "@type": "Organization", name: "GrantDeskHQ" } };
  return <article className="workspace-page"><div className="site-shell max-w-4xl py-12"><nav aria-label="Resource navigation" className="flex flex-wrap gap-4 text-sm font-semibold text-emerald-800"><Link className="underline" to="/resources">All resources</Link><Link className="underline" to="/blog">Guides and articles</Link></nav><p className="eyebrow mt-6">{post.readingMinutes} minute read{post.updatedAt ? " · Updated " + post.updatedAt : ""}</p><h1 className="page-title text-left">{post.title}</h1><p className="mt-4 text-lg text-slate-600">{post.description}</p><div className="mt-10 space-y-9">{post.sections.map((section) => <section key={section.heading}><h2 className="text-2xl font-bold text-slate-900">{section.heading}</h2>{section.paragraphs.map((paragraph) => <p className="mt-4 leading-7 text-slate-700" key={paragraph}>{paragraph}</p>)}{section.table ? <div className="mt-5 overflow-x-auto"><p className="text-sm text-slate-600">{section.table.caption}</p><table className="mt-3 w-full border-collapse text-left text-sm"><thead><tr>{section.table.headers.map((header) => <th className="border border-slate-300 bg-slate-50 p-2 font-semibold" key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join("|")}>{row.map((cell, index) => <td className={"border border-slate-300 p-2" + (index === 0 ? " font-medium" : "")} key={index}>{cell}</td>)}</tr>)}</tbody></table></div> : null}{section.links?.length ? <ul className="mt-5 list-disc space-y-2 pl-6">{section.links.map((link) => <li key={link.href}>{link.href.startsWith("/") ? <Link className="underline font-semibold" to={link.href}>{link.label}</Link> : <a className="underline font-semibold" href={link.href}>{link.label}</a>}</li>)}</ul> : null}</section>)}</div><aside className="panel mt-10 p-6"><h2 className="text-xl font-bold">Ready to organize a real report?</h2><p className="mt-2 text-slate-600">Use the Free First Award flow with one award, its terms, budget, accounting export, and evidence. Your team remains in control of review and submission.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="button button-primary" to="/assessment">Start your Free First Award</Link><Link className="button button-secondary" to="/pricing">View self-service plans</Link></div></aside><section className="mt-10"><h2 className="text-xl font-bold">Related resources</h2><ul className="mt-3 list-disc space-y-2 pl-6">{relatedPosts.map((related) => <li key={related.slug}><Link className="underline" to={"/blog/" + related.slug}>{related.title}</Link></li>)}</ul></section><section className="mt-10"><h2 className="text-xl font-bold">Sources and further reading</h2><ul className="mt-3 list-disc space-y-2 pl-6">{post.sources.map((source) => <li key={source.url}><a className="underline" href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></section><script type="application/ld+json">{JSON.stringify(articleSchema)}</script></div></article>;
}
