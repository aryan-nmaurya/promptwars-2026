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

const SESSION_STORAGE_KEY = "ideaforge.session";
const SESSION_HEADER = "x-session-id";

/**
 * Anonymous per-browser id used for rate limiting, so one student on a shared
 * campus IP cannot exhaust everyone else's budget.
 *
 * A header rather than a cookie: the web app and API are on different origins,
 * so any cookie the API set would be third-party and is blocked by Safari and
 * being phased out in Chrome. This identifies a browser, never a person - no
 * personal data, and it never leaves the local device except as this opaque id.
 */
function sessionId(): string | null {
  if (typeof window === "undefined") return null; // Server Components: no session
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    window.localStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return null; // private mode or blocked storage: fall back to IP limiting
  }
}

const AUTH_STORAGE_KEY = "ideaforge.auth.token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

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
  const session = sessionId();
  const auth = getAuthToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session === null ? {} : { [SESSION_HEADER]: session }),
        ...(auth === null ? {} : { Authorization: `Bearer ${auth}` }),
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
    signal?.removeEventListener("abort", forwardAbort);
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

// --- IdeaForge domain types (mirror api/app/schemas.py) ----------------------

export interface Idea {
  id: string;
  position: number;
  title: string;
  summary: string;
  problem_solved: string;
  feasibility: number;
  tech_stack: string[];
  /** Features the student is committing to deliver. */
  core_features: string[];
  /** Explicitly optional ideas that should not jeopardise the core build. */
  stretch_goals: string[];
}

export interface IdeaSet {
  id: string;
  interests: string;
  skills: string;
  created_at: string;
  /** True when Gemini was unreachable and seeded content was served. */
  used_fallback: boolean;
  ideas: Idea[];
}

export interface RoadmapStep {
  id: string;
  phase: string;
  position: number;
  title: string;
  detail: string;
  is_done: boolean;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
  onboarding_completed_at: string | null;
}

export interface AuthResponse {
  user: User;
  session_token: string;
}

export interface Project {
  id: string;
  user_id?: string | null;
  title: string;
  summary: string;
  problem_solved: string;
  feasibility: number;
  tech_stack: string[];
  core_features: string[];
  stretch_goals: string[];
  created_at: string;
  /** True when Gemini was unreachable and the seeded roadmap was served. */
  used_fallback: boolean;
  steps: RoadmapStep[];
  steps_total: number;
  steps_done: number;
  latest_evaluation: Evaluation | null;
}

/** Returned only when a project is created. The token is never part of a share URL. */
export interface ProjectCreateResponse {
  project: Project;
  edit_token: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  summary: string;
  feasibility: number;
  tech_stack: string[];
  created_at: string;
}

export interface MentorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface MentorReply {
  question: MentorMessage;
  answer: MentorMessage;
}

export type EvaluationStatus =
  | "implemented"
  | "partial"
  | "not_found"
  | "insufficient_evidence";

export interface EvaluationEvidence {
  path: string;
  reason: string;
}

export interface PlannedVsBuiltItem {
  planned_item: string;
  status: EvaluationStatus;
  confidence: number;
  evidence: EvaluationEvidence[];
  gap: string | null;
}

export interface EvaluationFix {
  title: string;
  why: string;
  how: string;
}

/**
 * `null` means the analyzed files held no evidence for that category, so it was
 * deliberately not scored and is excluded from `overall_score`. Render it as
 * "not assessed" - never as a zero, and never as a missing bar.
 */
export interface EvaluationScores {
  feature_completion: number;
  architecture: number | null;
  code_quality: number | null;
  testing: number | null;
  documentation: number | null;
  security: number | null;
}

export interface EvaluationRepository {
  url: string;
  full_name: string;
  commit_sha: string;
  default_branch: string;
}

export interface EvaluationCoverage {
  tree_complete: boolean;
  files_considered: number;
  files_analyzed: number;
  bytes_analyzed: number;
}

/** Evidence-backed static comparison of the frozen plan and one repository commit. */
export interface Evaluation {
  id: string;
  repository: EvaluationRepository;
  /** Weighted across the assessed categories only. */
  overall_score: number;
  scores: EvaluationScores;
  /** Names of the categories reported as `null` above. */
  unassessed_categories: string[];
  planned_vs_built: PlannedVsBuiltItem[];
  top_fixes: EvaluationFix[];
  coverage: EvaluationCoverage;
  limitations: string[];
  created_at: string;
}

/** Groups roadmap steps by phase, preserving server order. */
export function groupByPhase(steps: RoadmapStep[]): { phase: string; steps: RoadmapStep[] }[] {
  const phases: { phase: string; steps: RoadmapStep[] }[] = [];
  for (const step of steps) {
    const last = phases.at(-1);
    if (last && last.phase === step.phase) {
      last.steps.push(step);
    } else {
      phases.push({ phase: step.phase, steps: [step] });
    }
  }
  return phases;
}
