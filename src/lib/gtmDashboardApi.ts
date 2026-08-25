import { apiRequest } from "./api";
import type { CanonicalGtmModel } from "./gtmCanonical";

export type GtmTokenProvider = (forceRefresh?: boolean) => Promise<string>;
export type GtmRequest = <T>(path: string, token: string, init?: RequestInit) => Promise<T>;
const GTM_REQUEST_TIMEOUT_MS = 15_000;

/** A bounded, one-refresh request path for founder-only canonical GTM reads. */
export async function requestGtmWithFreshToken<T>(tokenProvider: GtmTokenProvider, path: string, request: GtmRequest = apiRequest, init?: RequestInit): Promise<T> {
  try { return await requestGtmOnce(tokenProvider, false, path, request, init); }
  catch (error) {
    if (!isAuthenticationFailure(error)) throw error;
    return requestGtmOnce(tokenProvider, true, path, request, init);
  }
}

export async function loadCanonicalGtmModel(tokenProvider: GtmTokenProvider, request: GtmRequest = apiRequest): Promise<CanonicalGtmModel> {
  const body = await requestGtmWithFreshToken<{ model: CanonicalGtmModel }>(tokenProvider, "/api/gtm/canonical", request);
  if (!isCanonicalGtmModel(body?.model)) throw new Error("The canonical GTM response is invalid.");
  return body.model;
}

async function requestGtmOnce<T>(tokenProvider: GtmTokenProvider, forceRefresh: boolean, path: string, request: GtmRequest, init?: RequestInit) {
  const token = await withinTimeout(tokenProvider(forceRefresh), "GTM authentication took too long.");
  const controller = new AbortController();
  try { return await withinTimeout(request<T>(path, token, { ...init, signal: controller.signal }), "GTM records took too long to load."); }
  catch (error) { controller.abort(); throw error; }
}

function withinTimeout<T>(promise: Promise<T>, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(timeoutMessage)), GTM_REQUEST_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timeout));
  });
}

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /\b401\b|session expired|sign in to continue|account session/.test(message);
}

function isCanonicalGtmModel(value: unknown): value is CanonicalGtmModel {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CanonicalGtmModel>;
  const metrics = candidate.metrics;
  return Array.isArray(candidate.records)
    && Boolean(metrics)
    && ["directReady", "partnerReady", "directNeedsVerification", "partnerNeedsVerification", "followUpsDue", "awaitingReply", "replies", "positiveReplies", "trials", "paid", "mrr"].every((key) => Number.isFinite(metrics?.[key as keyof CanonicalGtmModel["metrics"]]));
}
