import { useEffect } from "react";
import { Link } from "react-router-dom";
import { BLOG_POSTS, type BlogPost } from "../content/blog";

type ResourceGroup = { title: string; description: string; posts: BlogPost[] };

function setHeadMeta(attribute: "name" | "property", key: string, value: string) {
  const existing = Array.from(document.querySelectorAll<HTMLMetaElement>("meta[" + attribute + "]")).find((meta) => meta.getAttribute(attribute) === key);
  const meta = existing || document.createElement("meta");
  meta.setAttribute(attribute, key);
  meta.setAttribute("content", value);
  if (!existing) document.head.appendChild(meta);
}

function ResourceCard({ post }: { post: BlogPost }) {
  return <article className="panel p-6">
    <p className="eyebrow">{post.resourceCategory === "checklist" ? "Checklist" : "Guide"} · {post.readingMinutes} minute read</p>
    <h3 className="mt-3 text-2xl font-bold text-slate-900"><Link className="underline" to={"/blog/" + post.slug}>{post.title}</Link></h3>
    <p className="mt-3 text-slate-600">{post.description}</p>
    <Link className="button button-secondary mt-5" to={"/blog/" + post.slug}>Open resource</Link>
  </article>;
}

export function ResourcesPage() {
  useEffect(() => {
    const canonicalUrl = "https://grantdeskhq.com/resources";
    document.title = "Post-Award Grant Reporting Resources | GrantDeskHQ";
    setHeadMeta("name", "description", "Practical guides, templates, and checklists for nonprofit finance and grants teams managing post-award reporting.");
    setHeadMeta("property", "og:type", "website");
    setHeadMeta("property", "og:title", "Post-Award Grant Reporting Resources | GrantDeskHQ");
    setHeadMeta("property", "og:description", "Practical guides, templates, and checklists for nonprofit post-award grant reporting.");
    setHeadMeta("property", "og:url", canonicalUrl);
    const canonical = document.querySelector("link[rel=canonical]") || document.head.appendChild(Object.assign(document.createElement("link"), { rel: "canonical" }));
    canonical.setAttribute("href", canonicalUrl);
  }, []);

  const groups: ResourceGroup[] = [
    { title: "Guides & articles", description: "Practical workflow guidance for making post-award reporting reviewable.", posts: BLOG_POSTS.filter((post) => post.resourceCategory === "guide") },
    { title: "Templates & checklists", description: "Published checklists and templates, added only after content review.", posts: BLOG_POSTS.filter((post) => post.resourceCategory === "checklist") }
  ];
  const collectionSchema = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Post-Award Grant Reporting Resources", description: "Practical guides, templates, and checklists for nonprofit post-award grant reporting.", url: "https://grantdeskhq.com/resources", mainEntity: { "@type": "ItemList", itemListElement: BLOG_POSTS.map((post, index) => ({ "@type": "ListItem", position: index + 1, url: "https://grantdeskhq.com/blog/" + post.slug, name: post.title })) } };

  return <section className="workspace-page">
    <div className="site-shell py-12">
      <div className="max-w-3xl">
        <p className="eyebrow">GrantDeskHQ resources</p>
        <h1 className="page-title">Practical resources for post-award grant reporting</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">Guides, templates, and checklists to help nonprofit finance and grants teams manage reporting after the award.</p>
      </div>
      <div className="mt-10 grid gap-10">
        {groups.map((group) => <section key={group.title} aria-labelledby={group.title.toLowerCase().replace(/[^a-z]+/g, "-")}>
          <div className="max-w-3xl">
            <p className="eyebrow">Resources</p>
            <h2 id={group.title.toLowerCase().replace(/[^a-z]+/g, "-")} className="mt-2 text-3xl font-bold text-navy-950">{group.title}</h2>
            <p className="mt-2 text-slate-600">{group.description}</p>
          </div>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {group.posts.map((post) => <ResourceCard key={post.slug} post={post} />)}
          </div>
        </section>)}
      </div>
      <aside className="panel mt-12 flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">See the workflow</p>
          <h2 className="mt-2 text-2xl font-bold text-navy-950">Use these resources with a real award when you are ready.</h2>
          <p className="mt-2 max-w-2xl text-slate-600">GrantDeskHQ brings award terms, accounting data, program updates, and supporting evidence into a source-linked reporting workflow for professional review.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link className="button button-secondary" to="/#how-it-works">See how GrantDeskHQ works</Link>
          <Link className="button button-primary" to="/assessment">Try GrantDeskHQ with one award</Link>
        </div>
      </aside>
      <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
    </div>
  </section>;
}
