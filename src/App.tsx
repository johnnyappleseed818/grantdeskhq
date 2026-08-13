import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import { LandingPage } from "./pages/LandingPage";
import { DemoPage } from "./pages/DemoPage";
import { SampleReportPage } from "./pages/SampleReportPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { PilotPage } from "./pages/PilotPage";
import { PricingPage } from "./pages/PricingPage";
import { CompilePage } from "./pages/CompilePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoginPage } from "./pages/LoginPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { GtmDashboardPage } from "./pages/GtmDashboardPage";
import { ReadinessPage } from "./pages/ReadinessPage";
import { ReliabilityDashboardPage } from "./pages/ReliabilityDashboardPage";
import { AuthProvider } from "./lib/auth";
import { AnalyticsManager } from "./lib/analytics";

const routeMetadata: Record<string, { title: string; description: string }> = {
  "/": {
    title: "GrantDeskHQ | AI-powered post-award grant reporting",
    description: "GrantDeskHQ turns grant agreements, accounting data, and program updates into source-linked funder-report drafts without messy spreadsheets."
  },
  "/demo": {
    title: "GrantDeskHQ Demo | Source-linked grant reporting",
    description: "See how GrantDeskHQ turns a grant agreement, financial data, program results, and evidence into a source-linked post-award report workflow."
  },
  "/sample-report": {
    title: "Sample Grant Report | GrantDeskHQ",
    description: "Explore a synthetic, source-linked grant report showing financial mappings, program results, evidence, and review controls."
  },
  "/pricing": {
    title: "GrantDeskHQ Pricing | Plans for nonprofit grant teams",
    description: "Compare Essentials, Growth, and Portfolio plans for AI-powered post-award grant reporting. Your first report is free."
  },
  "/assessment": {
    title: "Free First Grant Report | GrantDeskHQ",
    description: "Analyze your first post-award grant report free and see how much reporting work GrantDeskHQ can prepare from the files your team already has."
  },
  "/readiness": {
    title: "Free Grant Reporting Readiness Audit | GrantDeskHQ",
    description: "Audit one grant agreement free to identify reporting obligations, evidence needs, deadlines, and post-award workflow requirements."
  },
  "/privacy": {
    title: "Privacy and Data Handling | GrantDeskHQ",
    description: "Learn how GrantDeskHQ stores source files, processes selected report context, controls workspace access, and keeps AI-powered output reviewable."
  }
};

const privateRoutes = new Set(["/compile", "/login", "/workspace", "/gtm", "/internal/reliability", "/pilot"]);

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.append(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

function RouteEffects() {
  const location = useLocation();

  useEffect(() => {
    const metadata = routeMetadata[location.pathname];
    const shouldIndex = Boolean(metadata) && !privateRoutes.has(location.pathname);
    const title = metadata?.title ?? "GrantDeskHQ";
    const description = metadata?.description ?? "GrantDeskHQ post-award grant reporting workspace.";
    const canonicalUrl = `https://grantdeskhq.com${location.pathname === "/" ? "/" : location.pathname}`;
    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: shouldIndex ? "index, follow" : "noindex, nofollow" });
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = canonicalUrl;

    if (location.hash) {
      window.requestAnimationFrame(() => {
        document.getElementById(location.hash.slice(1))?.scrollIntoView();
      });
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname, location.hash]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AnalyticsManager />
      <RouteEffects />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="sample-report" element={<SampleReportPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="compile" element={<CompilePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="workspace" element={<WorkspacePage />} />
          <Route path="gtm" element={<GtmDashboardPage />} />
          <Route path="internal/reliability" element={<ReliabilityDashboardPage />} />
          <Route path="readiness" element={<ReadinessPage />} />
          <Route path="assessment" element={<PilotPage />} />
          <Route path="pilot" element={<Navigate replace to="/assessment" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
