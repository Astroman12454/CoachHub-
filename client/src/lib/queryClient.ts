import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const SESSION_QUERY_KEY = "/api/session";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // A 401 from any endpoint (not just the session check itself) means the
    // session expired or was revoked server-side — reflect that immediately
    // so the app falls back to the login screen instead of failing calls
    // silently until the next unrelated re-render.
    if (res.status === 401 && !res.url.endsWith(SESSION_QUERY_KEY)) {
      queryClient.setQueryData([SESSION_QUERY_KEY], { authenticated: false });
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// apiRequest throws `Error("<status>: <raw body>")`; the raw body is
// usually `{"message":"..."}` from our own API. Pulls that message back out
// so callers (e.g. useSaveMutation's error toast) can show the server's
// actual reason — a plan-limit message, a validation error — instead of a
// generic fallback string.
export function extractErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const jsonStart = error.message.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    const parsed = JSON.parse(error.message.slice(jsonStart));
    return typeof parsed?.message === "string" ? parsed.message : null;
  } catch {
    return null;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
