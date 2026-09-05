/**
 * Regression cover for accessibility defects that were fixed, because each one
 * is invisible in normal use and would come back unnoticed.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceLayout from "@/app/(workspace)/layout";
import NotFound from "@/app/not-found";
import { Chip } from "@/components/ui";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ push: vi.fn() }),
}));

const get = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (...args: unknown[]) => get(...args) } };
});

describe("Chip", () => {
  it("exposes remove as a sibling button, never nested inside the toggle", async () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    render(
      <Chip selected onClick={onClick} onRemove={onRemove} removeLabel="Remove custom interest x">
        x
      </Chip>,
    );

    const remove = screen.getByRole("button", { name: "Remove custom interest x" });
    const toggle = screen.getByRole("button", { name: "x" });

    // Interactive-inside-interactive is invalid HTML and unreliable in AT.
    expect(toggle.contains(remove)).toBe(false);
    expect(remove.tagName).toBe("BUTTON");
  });

  it("removes on keyboard activation without also toggling", async () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Chip selected onClick={onClick} onRemove={onRemove} removeLabel="Remove tag">
        x
      </Chip>,
    );

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Remove tag" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("carries selection in aria-pressed, not only in colour", () => {
    render(<Chip selected>Accessibility</Chip>);

    expect(screen.getByRole("button", { name: "Accessibility" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("not-found page", () => {
  it("provides the main landmark the root layout's skip link targets", () => {
    render(<NotFound />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(within(main).getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

describe("workspace mobile drawer", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ status: "ok", db: true, gemini: true });
  });

  it("is a modal dialog, traps focus, and restores it on close", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceLayout>
        <p>content</p>
      </WorkspaceLayout>,
    );
    const toggle = screen.getByRole("button", { name: /open navigation menu/i });

    await user.click(toggle);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/workspace navigation/i);
    // Focus moved into the panel rather than being left on a removed control.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it("keeps a reachable close control inside the trap", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceLayout>
        <p>content</p>
      </WorkspaceLayout>,
    );

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));
    const dialog = await screen.findByRole("dialog");

    // The header toggle is outside the dialog, so a dismiss control has to
    // live inside it or the drawer is a keyboard dead end.
    const close = within(dialog).getByRole("button", { name: /close menu/i });
    await user.click(close);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
