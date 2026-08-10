const configuredEndpoint = import.meta.env.VITE_COMPILER_ENDPOINT as string | undefined;
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN
  || (configuredEndpoint ? new URL(configuredEndpoint).origin : "");

export function apiUrl(path: string) {
  return `${API_ORIGIN}${path}`;
}

export async function apiRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers
    }
  });
  const responseText = await response.text();
  let body: (T & { error?: string }) | null = null;
  if (responseText) {
    try {
      body = JSON.parse(responseText) as T & { error?: string };
    } catch {
      if (!response.ok) throw new Error(requestFailureMessage(path, response.status));
      throw new Error("GrantDeskHQ received an unreadable response. Please try again.");
    }
  }
  if (!response.ok) throw new Error(body?.error || requestFailureMessage(path, response.status));
  if (!body) throw new Error("GrantDeskHQ received an empty response. Please try again.");
  return body;
}

function requestFailureMessage(path: string, status: number) {
  if (path.includes("/reports/compile") && [502, 503, 504].includes(status)) {
    return "Report generation was temporarily interrupted. Your source files were not changed. Try again; GrantDeskHQ will reuse a completed result instead of creating a duplicate.";
  }
  return `GrantDeskHQ could not complete this request (status ${status}). Please try again.`;
}
