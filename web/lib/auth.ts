"use client";

import { useMemo, useSyncExternalStore } from "react";

import { api, type AuthResponse, type User } from "./api";
import {
  forgetLocalProjects,
  getProjectEditToken,
  useProjectEditToken,
  useRecentProjects,
} from "./project-access";

const AUTH_TOKEN_KEY = "ideaforge.auth.token";
const AUTH_USER_KEY = "ideaforge.auth.user";
const AUTH_EVENT = "ideaforge:auth-changed";

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyAuthChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(AUTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(AUTH_EVENT, onStoreChange);
  };
}

export function getSessionToken(): string | null {
  return safeLocalStorage()?.getItem(AUTH_TOKEN_KEY) ?? null;
}

export function getCurrentUser(): User | null {
  const raw = safeLocalStorage()?.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function setSession(user: User, token: string): void {
  const storage = safeLocalStorage();
  if (storage === null) return;
  storage.setItem(AUTH_TOKEN_KEY, token);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  notifyAuthChanged();
}

function clearSession(): void {
  const storage = safeLocalStorage();
  if (storage === null) return;
  storage.removeItem(AUTH_TOKEN_KEY);
  storage.removeItem(AUTH_USER_KEY);
  notifyAuthChanged();
}

export function updateUser(user: User): void {
  const storage = safeLocalStorage();
  if (storage === null) return;
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  notifyAuthChanged();
}

export async function signIn(email: string, password: string): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/login", { email, password });
  setSession(res.user, res.session_token);
  return res.user;
}

export async function signUp(
  email: string,
  password: string,
  adoptedProjects?: { project_id: string; edit_token: string }[],
): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/signup", {
    email,
    password,
    adopted_projects: adoptedProjects ?? [],
  });
  setSession(res.user, res.session_token);
  return res.user;
}

export async function signOut(): Promise<void> {
  try {
    await api.post<void>("/auth/logout", {});
  } catch {
    // Best-effort remote invalidation; local cleanup happens regardless
  }
  clearSession();
  // The project index and edit capabilities are browser-scoped. Leaving them
  // behind handed the next account on this machine the previous student's
  // projects, and the capability to edit them.
  forgetLocalProjects();
}

export interface SessionState {
  user: User | null;
  sessionToken: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

function authSnapshot(): string {
  const storage = safeLocalStorage();
  if (!storage) return "::";
  const token = storage.getItem(AUTH_TOKEN_KEY) ?? "";
  const user = storage.getItem(AUTH_USER_KEY) ?? "";
  return `${token}:${user}`;
}

export function useSession(): SessionState {
  const snapshot = useSyncExternalStore(
    subscribe,
    authSnapshot,
    () => "::",
  );

  return useMemo(() => {
    const separatorIndex = snapshot.indexOf(":");
    if (separatorIndex === -1) {
      return { user: null, sessionToken: null, status: "unauthenticated" };
    }
    const token = snapshot.slice(0, separatorIndex);
    const userRaw = snapshot.slice(separatorIndex + 1);
    if (!token || !userRaw) {
      return { user: null, sessionToken: null, status: "unauthenticated" };
    }
    try {
      const user = JSON.parse(userRaw) as User;
      return { user, sessionToken: token, status: "authenticated" };
    } catch {
      return { user: null, sessionToken: null, status: "unauthenticated" };
    }
  }, [snapshot]);
}

/** Collects all anonymous projects saved on this device to pass into signup. */
export function useAdoptableProjects(): { project_id: string; edit_token: string }[] {
  const recent = useRecentProjects();
  return useMemo(() => {
    const adoptable: { project_id: string; edit_token: string }[] = [];
    for (const p of recent) {
      const token = getProjectEditToken(p.id);
      if (token) {
        adoptable.push({ project_id: p.id, edit_token: token });
      }
    }
    return adoptable;
  }, [recent]);
}

export function useCanEditProject(projectId: string, projectOwnerId?: string | null): boolean {
  const editToken = useProjectEditToken(projectId);
  const { user, status } = useSession();

  if (editToken !== null) return true;
  if (status === "authenticated" && Boolean(user?.id && projectOwnerId && user.id === projectOwnerId)) {
    return true;
  }
  return false;
}

