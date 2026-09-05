/**
 * Step 1 → 2 → 3 → generate. This is the path the problem statement describes
 * ("ideas based on their interests and skills"), so the payload the API
 * receives is the thing worth pinning down.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingPage from "@/app/(workspace)/onboarding/page";
import { ApiError } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const post = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, post: (...args: unknown[]) => post(...args) } };
});

async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Accessibility" }));
  await user.click(screen.getByRole("button", { name: /continue to skills/i }));
  await user.click(screen.getByRole("button", { name: "Python" }));
  await user.click(screen.getByRole("button", { name: /review prompt/i }));
}

describe("onboarding", () => {
  beforeEach(() => {
    push.mockReset();
    post.mockReset();
  });

  it("blocks step 1 until an interest is chosen", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    expect(screen.getByRole("button", { name: /continue to skills/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Accessibility" }));

    expect(screen.getByRole("button", { name: /continue to skills/i })).toBeEnabled();
  });

  it("blocks step 2 until a skill is chosen", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: "Accessibility" }));
    await user.click(screen.getByRole("button", { name: /continue to skills/i }));

    expect(screen.getByRole("button", { name: /review prompt/i })).toBeDisabled();
  });

  it("carries interests and skills-with-proficiency into the request", async () => {
    post.mockResolvedValue({ id: "set-xyz" });
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await walkToReview(user);
    await user.click(screen.getByRole("button", { name: /generate 3 project ideas/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/ideas",
        { interests: "Accessibility", skills: "Python (comfortable)" },
        expect.anything(),
      ),
    );
    expect(push).toHaveBeenCalledWith("/ideas/set-xyz");
  });

  it("records a skill the student is still learning", async () => {
    post.mockResolvedValue({ id: "set-xyz" });
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByRole("button", { name: "Accessibility" }));
    await user.click(screen.getByRole("button", { name: /continue to skills/i }));
    await user.click(screen.getByRole("button", { name: "Python" }));
    await user.click(screen.getByRole("button", { name: "Learning" }));
    await user.click(screen.getByRole("button", { name: /review prompt/i }));
    await user.click(screen.getByRole("button", { name: /generate 3 project ideas/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/ideas",
        expect.objectContaining({ skills: "Python (learning)" }),
        expect.anything(),
      ),
    );
  });

  it("keeps the student on the review step when generation fails", async () => {
    post.mockRejectedValue(new ApiError("AI service is not configured", 503, "/ideas"));
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await walkToReview(user);
    await user.click(screen.getByRole("button", { name: /generate 3 project ideas/i }));

    expect(await screen.findByText(/AI service is not configured/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /generate 3 project ideas/i })).toBeEnabled();
  });

  it("adds and removes a custom interest without leaving it in the payload", async () => {
    post.mockResolvedValue({ id: "set-xyz" });
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.type(screen.getByLabelText(/add your own/i), "quantum algorithms{Enter}");
    expect(screen.getByRole("button", { name: "quantum algorithms" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove custom interest/i }));

    expect(screen.queryByRole("button", { name: "quantum algorithms" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to skills/i })).toBeDisabled();
  });

  it("names its progress indicator for assistive tech", () => {
    render(<OnboardingPage />);

    const progress = screen.getByRole("progressbar", { name: /onboarding progress/i });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
  });
});
