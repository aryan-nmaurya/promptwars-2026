/**
 * This badge used to read "LIVE" as a hardcoded string, so it asserted the
 * Google dependency was healthy at exactly the moments it was not. These pin
 * it to what `/health` actually reports.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GeminiStatusCard } from "@/components/GeminiStatusCard";
import { ApiError } from "@/lib/api";

const get = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (...args: unknown[]) => get(...args) } };
});

describe("GeminiStatusCard", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("reports Live only when the API says Gemini answered", async () => {
    get.mockResolvedValue({ status: "ok", db: true, gemini: true });

    render(<GeminiStatusCard />);

    expect(await screen.findByText("Live")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/health", expect.anything());
  });

  it("says Degraded when the API is up but Gemini is not answering", async () => {
    get.mockResolvedValue({ status: "ok", db: true, gemini: false });

    render(<GeminiStatusCard />);

    expect(await screen.findByText("Degraded")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    // The word carries the meaning, so the state is not colour-only.
    expect(await screen.findByText(/falls back to seeded content/i)).toBeInTheDocument();
  });

  it("admits it does not know when the API cannot be reached", async () => {
    get.mockRejectedValue(new ApiError("Could not reach the API.", 0, "/health"));

    render(<GeminiStatusCard />);

    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });
});
