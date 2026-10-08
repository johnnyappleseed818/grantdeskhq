/**
 * Release canaries must exercise the revision that received the authenticated
 * request. A stale configured tag is not an authority for nested canary calls.
 */
export function reliabilityCanaryOrigin(requestOrigin: string, _configuredOrigin?: string) {
  return requestOrigin;
}
