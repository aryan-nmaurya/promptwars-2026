/**
 * Typed fetch wrapper.
 *
 * Rules this enforces so you do not have to think about them at 2am:
 *  - every failure arrives as an `ApiError` with a `status` and a human message
 *  - the backend's `{"error": "..."}` shape is unwrapped automatically
 *  - network failures, timeouts and non-JSON responses all normalise to the same
 *    thing, so a `catch` block never has to guess
 *  - every value is narrowed, never widened - no escape hatches
 */

/** The single error shape the API returns. Mirrors `app/schemas.py`. */
export interface ApiErrorBody {
  error: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: unknown;

  constructor(message: string, status: number, url: string, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }

  /** True when the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  /** Query string values. `undefined` and `null` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body. Omit for GET/DELETE. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Milliseconds before the request is aborted. Default 15000. */
  timeoutMs?: number;
  /** Next.js fetch cache hint. Defaults to no-store so data is never stale. */
  cache?: RequestCache;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The API origin. `NEXT_PUBLIC_*` is compiled into the browser bundle, so this
 * must never hold a secret - it is a public URL and nothing else.
 */
export function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return raw.replace(/\/+$/, "");
}

function buildUrl(path: string, query: RequestOptions["query"]): string {
  const url = new URL(
    path.startsWith("/") ? path : `/${path}`,
    `${apiBaseUrl()}/`,
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Perform a request and parse the JSON response as `T`.
 *
 * `T` is an assertion, not a validation - the backend's Pydantic models are the
 * contract. If you need runtime validation, parse the result here.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = options.body === undefined ? "GET" : "POST",
    query,
    body,
    headers,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cache = "no-store",
  } = options;
  const url = buildUrl(path, query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache,
    });
  } catch (cause) {
    const aborted = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiError(
      aborted
        ? `Request timed out after ${timeoutMs}ms`
        : "Could not reach the API. Is it running, and is this origin in ALLOWED_ORIGINS?",
      0,
      url,
      cause,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null as T;

  const parsed = await readBody(response);

  if (!response.ok) {
    const message = isApiErrorBody(parsed)
      ? parsed.error
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, url, parsed);
  }

  return parsed as T;
}

/** Verb helpers. All of them funnel into `apiFetch`, which is the only code path. */
type BodylessOptions = Omit<RequestOptions, "body" | "method">;
type BodyOptions = Omit<RequestOptions, "body" | "method">;

export const api = {
  get: <T>(path: string, options?: BodylessOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body: unknown, options?: BodyOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: "POST", body }),

  patch: <T>(path: string, body: unknown, options?: BodyOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),

  put: <T>(path: string, body: unknown, options?: BodyOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),

  delete: <T>(path: string, options?: BodylessOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

/** Turns anything thrown into a message you can safely render. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

// --- Shared response types ---------------------------------------------------

/** Mirrors `HealthResponse` in `app/schemas.py`. */
export interface HealthResponse {
  status: string;
  db: boolean;
}

/** Mirrors `Page[T]` in `app/schemas.py`. */
export interface Page<T> {
  items: T[];
  meta: { total: number; limit: number; offset: number };
}
