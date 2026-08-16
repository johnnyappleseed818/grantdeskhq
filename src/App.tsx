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
import { BlogIndexPage, BlogPostPage } from "./pages/BlogPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { AuthProvider } from "./lib/auth";
import { AnalyticsManager } from "./lib/analytics";

function RouteEffects() {
  const location = useLocation();

  useEffect(() => {
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
          <Route path="blog" element={<BlogIndexPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="blog/:slug" element={<BlogPostPage />} />
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
