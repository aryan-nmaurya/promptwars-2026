"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { Project } from "./api";

const TOKEN_PREFIX = "ideaforge.project.edit-token.";
const RECENT_PROJECTS_KEY = "ideaforge.recent-projects";
const ACCESS_EVENT = "ideaforge:project-access-changed";
const RECENT_LIMIT = 12;

export const PROJECT_EDIT_HEADER = "x-project-edit-token";

export interface RecentProject {
  id: string;
  title: string;
  summary: string;
  created_at: string;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyAccessChanged(): void {
  window.dispatchEvent(new Event(ACCESS_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ACCESS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ACCESS_EVENT, onStoreChange);
  };
}

export function getProjectEditToken(projectId: string): string | null {
  return safeLocalStorage()?.getItem(`${TOKEN_PREFIX}${projectId}`) ?? null;
}

/**
 * Forget every project held on this device.
 *
 * Called on sign-out. The local index and the per-project capabilities are
 * browser-scoped, not account-scoped, so without this the next person to sign
 * in on a shared machine inherited the previous person's project list — and,
 * because the capabilities were still present, the ability to edit them.
 * A signed-in student loses nothing: their projects come back from the server
 * the moment they sign in again.
 */
export function forgetLocalProjects(): void {
  const storage = safeLocalStorage();
  if (storage === null) return;

  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && key.startsWith(TOKEN_PREFIX)) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
  storage.removeItem(RECENT_PROJECTS_KEY);
  notifyAccessChanged();
}

export function projectEditHeaders(editToken: string): Record<string, string> {
  return { [PROJECT_EDIT_HEADER]: editToken };
}

/** Keep the write capability on this device, separate from the shareable URL. */
export function rememberOwnedProject(project: Project, editToken: string): void {
  const storage = safeLocalStorage();
  if (storage === null) return;

  storage.setItem(`${TOKEN_PREFIX}${project.id}`, editToken);

  const recent = readRecentProjects(storage).filter((item) => item.id !== project.id);
  recent.unshift({
    id: project.id,
    title: project.title,
    summary: project.summary,
    created_at: project.created_at,
  });
  storage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent.slice(0, RECENT_LIMIT)));
  notifyAccessChanged();
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.summary === "string" &&
    typeof item.created_at === "string"
  );
}

function readRecentProjects(storage: Storage): RecentProject[] {
  const raw = storage.getItem(RECENT_PROJECTS_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentProject) : [];
  } catch {
    return [];
  }
}

function tokenSnapshot(projectId: string): string {
  return getProjectEditToken(projectId) ?? "";
}

function recentSnapshot(): string {
  return safeLocalStorage()?.getItem(RECENT_PROJECTS_KEY) ?? "[]";
}

export function useProjectEditToken(projectId: string): string | null {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => tokenSnapshot(projectId),
    () => "",
  );
  return snapshot || null;
}

export function useRecentProjects(): RecentProject[] {
  const snapshot = useSyncExternalStore(subscribe, recentSnapshot, () => "[]");
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(snapshot);
      return Array.isArray(parsed) ? parsed.filter(isRecentProject) : [];
    } catch {
      return [];
    }
  }, [snapshot]);
}
