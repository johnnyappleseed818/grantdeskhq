/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiUrl } from "./api";

const CONSENT_KEY = "grantdeskhq:analytics-consent:v1";
const OPEN_PREFERENCES_EVENT = "grantdeskhq:open-analytics-preferences";
const PRIVATE_ROUTE_PREFIXES = ["/compile", "/gtm", "/login", "/readiness", "/workspace"];
const DEFAULT_CLARITY_PROJECT_ID = "xzcynx2076";

type AnalyticsConsent = "granted" | "denied";
type ClarityFunction = ((...args: unknown[]) => void) & { q?: unknown[][] };

interface AnalyticsConfig {
  googleAnalyticsMeasurementId?: string;
  clarityProjectId?: string;
}

declare global {
  interface Window {
    clarity?: ClarityFunction;
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function AnalyticsManager() {
  const location = useLocation();
  const [config, setConfig] = useState<AnalyticsConfig | null>(null);
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() => readStoredConsent());
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const lastPageView = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/config"), { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<AnalyticsConfig> : {})
      .then((nextConfig) => setConfig(sanitizeConfig(nextConfig)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setConfig(sanitizeConfig({}));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const openPreferences = () => setPreferencesOpen(true);
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPreferences);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, openPreferences);
  }, []);

  useEffect(() => {
    if (!config || consent !== "granted") return;
    if (config.googleAnalyticsMeasurementId) initializeGoogleAnalytics(config.googleAnalyticsMeasurementId);
    if (config.clarityProjectId) initializeClarity(config.clarityProjectId);
  }, [config, consent]);

  useEffect(() => {
    if (!config || consent !== "granted") return;
    const path = normalizedPagePath(location.pathname);
    const isPrivate = isPrivateAnalyticsRoute(path);
    window.clarity?.("set", "route_scope", isPrivate ? "private-masked" : "public-marketing");
    window.clarity?.("set", "page_path", path);
    if (isPrivate || !config.googleAnalyticsMeasurementId || lastPageView.current === path) return;
    lastPageView.current = path;
    window.gtag?.("event", "page_view", {
      page_title: document.title,
      page_location: `${window.location.origin}${path}`,
      page_path: path
    });
  }, [config, consent, location.pathname]);

  const configured = Boolean(config?.googleAnalyticsMeasurementId || config?.clarityProjectId);
  const showPreferences = configured && (consent === null || preferencesOpen);
  if (!showPreferences) return null;

  const saveConsent = (nextConsent: AnalyticsConsent) => {
    window.localStorage.setItem(CONSENT_KEY, nextConsent);
    setConsent(nextConsent);
    setPreferencesOpen(false);
    if (nextConsent === "denied") {
      window.gtag?.("consent", "update", analyticsConsent("denied"));
      window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
    }
  };

  return (
    <section className="analytics-consent" role="dialog" aria-modal="false" aria-labelledby="analytics-consent-title" aria-describedby="analytics-consent-description">
      <div>
        <h2 id="analytics-consent-title">Help us improve GrantDeskHQ</h2>
        <p id="analytics-consent-description">With your permission, Google Analytics and Microsoft Clarity help us understand which public pages are useful and where visitors get stuck. Uploaded files, report content, form entries, and account details are not sent to these tools.</p>
        <Link to="/privacy">Privacy and analytics details</Link>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="button button-secondary" onClick={() => saveConsent("denied")}>Decline</button>
        <button type="button" className="button button-primary" onClick={() => saveConsent("granted")}>Allow analytics</button>
      </div>
    </section>
  );
}

export function openAnalyticsPreferences() {
  window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}

export function isPrivateAnalyticsRoute(pathname: string) {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function readStoredConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

function sanitizeConfig(config: AnalyticsConfig): AnalyticsConfig {
  const measurementId = String(config.googleAnalyticsMeasurementId || "").trim();
  const clarityProjectId = String(config.clarityProjectId || DEFAULT_CLARITY_PROJECT_ID).trim();
  return {
    googleAnalyticsMeasurementId: /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : undefined,
    clarityProjectId: /^[a-z0-9]+$/i.test(clarityProjectId) ? clarityProjectId : undefined
  };
}

function normalizedPagePath(pathname: string) {
  const clean = pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return clean || "/";
}

function analyticsConsent(analyticsStorage: AnalyticsConsent) {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  };
}

function initializeGoogleAnalytics(measurementId: string) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag("consent", "default", analyticsConsent("granted"));
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  if (document.getElementById("grantdeskhq-google-analytics")) return;
  const script = document.createElement("script");
  script.id = "grantdeskhq-google-analytics";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
}

function initializeClarity(projectId: string) {
  if (!window.clarity) {
    const clarity: ClarityFunction = (...args: unknown[]) => {
      clarity.q = clarity.q || [];
      clarity.q.push(args);
    };
    window.clarity = clarity;
  }
  window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
  if (document.getElementById("grantdeskhq-microsoft-clarity")) return;
  const script = document.createElement("script");
  script.id = "grantdeskhq-microsoft-clarity";
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.append(script);
}
