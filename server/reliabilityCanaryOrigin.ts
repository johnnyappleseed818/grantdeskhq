/**
 * Release canaries must exercise the revision that received the authenticated
 * request. A stale configured tag is not an authority for nested canary calls.
 */
export function reliabilityCanaryOrigin(requestOrigin: string, _configuredOrigin?: string) {
  // Kept as an explicit argument so callers document that a stale deployment
  // setting was considered and intentionally cannot redirect a candidate.
  void _configuredOrigin;
  return requestOrigin;
}
