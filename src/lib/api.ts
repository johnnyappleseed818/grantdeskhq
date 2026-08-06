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
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed with status ${response.status}.`);
  return body;
}
