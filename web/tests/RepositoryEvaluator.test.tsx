/**
 * The evaluation is the most expensive call in the product, so the client-side
 * URL guard and the "not assessed ≠ zero" rendering both matter: one stops a
 * wasted request, the other stops the report claiming a failing grade for
 * something nobody measured.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryEvaluator } from "@/components/RepositoryEvaluator";
import { ApiError, type Evaluation } from "@/lib/api";

const post = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, post: (...args: unknown[]) => post(...args) } };
});

const PROJECT_ID = "proj-abc123";

function asOwner() {
  localStorage.setItem(`ideaforge.project.edit-token.${PROJECT_ID}`, "raw-edit-capability");
}

function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: "eval-1",
    repository: {
      url: "https://github.com/acme/demo",
      full_name: "acme/demo",
      commit_sha: "a".repeat(40),
      default_branch: "main",
    },
    overall_score: 72,
    scores: {
      feature_completion: 80,
      architecture: 70,
      code_quality: 75,
      testing: null,
      documentation: 60,
      security: null,
    },
    unassessed_categories: ["testing", "security"],
    planned_vs_built: [
      {
        planned_item: "Create and save records",
        status: "implemented",
        confidence: 0.9,
        evidence: [{ path: "app/routes.py", reason: "Handles the create workflow." }],
        gap: null,
      },
      {
        planned_item: "Notify on missed dose",
        status: "not_found",
        confidence: 0.2,
        evidence: [],
        gap: "No supplied file implements notifications.",
      },
    ],
    top_fixes: [{ title: "Add tests", why: "No regression cover.", how: "Start with the API." }],
    coverage: {
      tree_complete: true,
      files_considered: 40,
      files_analyzed: 12,
      bytes_analyzed: 20480,
    },
    limitations: ["Static inspection only; repository code was not executed."],
    created_at: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

describe("RepositoryEvaluator", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("hides the form from a shared viewer", () => {
    render(<RepositoryEvaluator projectId={PROJECT_ID} initialEvaluation={null} />);

    expect(screen.queryByRole("button", { name: /evaluate repository/i })).not.toBeInTheDocument();
    expect(screen.getByText(/shared view is read-only/i)).toBeInTheDocument();
  });

  it("rejects a non-repository URL without spending a request", async () => {
    asOwner();
    const user = userEvent.setup();
    render(<RepositoryEvaluator projectId={PROJECT_ID} initialEvaluation={null} />);

    await user.type(
      screen.getByRole("textbox", { name: /public github repository/i }),
      "https://github.com/acme/demo/issues/4",
    );
    await user.click(screen.getByRole("button", { name: /evaluate repository/i }));

    expect(await screen.findByText(/not a file or issue URL/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("renders an unassessed category as 'Not assessed', never as zero", () => {
    render(
      <RepositoryEvaluator projectId={PROJECT_ID} initialEvaluation={evaluation()} />,
    );

    expect(screen.getAllByText("Not assessed")).toHaveLength(2);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText(/weighted across the assessed categories only/i)).toBeInTheDocument();
  });

  it("labels every planned item with a word, not only a colour", () => {
    render(
      <RepositoryEvaluator projectId={PROJECT_ID} initialEvaluation={evaluation()} />,
    );

    expect(screen.getByText("Implemented")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText(/No supplied file implements notifications/)).toBeInTheDocument();
  });

  it("shows a retryable error when the API refuses", async () => {
    asOwner();
    post.mockRejectedValue(new ApiError("GitHub rate limit reached; try again later", 429, "/e"));
    const user = userEvent.setup();
    render(<RepositoryEvaluator projectId={PROJECT_ID} initialEvaluation={null} />);

    await user.type(
      screen.getByRole("textbox", { name: /public github repository/i }),
      "https://github.com/acme/demo",
    );
    await user.click(screen.getByRole("button", { name: /evaluate repository/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/GitHub rate limit reached/);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
