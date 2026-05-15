/**
 * Phase 10.5 — TeamDialog tests.
 *
 * Mocks the api module. Covers render states (owner vs member),
 * add/remove flows, approver-pending banner, and approval action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TeamDialog } from "../TeamDialog";

vi.mock("../../../../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  HttpError: class extends Error {},
}));

import { api } from "../../../../lib/api";

const OWNER = {
  userId: "owner1",
  email: "owner@example.com",
  name: "Эзэн",
  role: "engineer" as const,
  addedAt: "2026-05-01T00:00:00Z",
  isOwner: true,
  approvedAt: null,
};
const CHECKER = {
  userId: "u2",
  email: "checker@example.com",
  name: "Шалгагч",
  role: "checker" as const,
  addedAt: "2026-05-02T00:00:00Z",
  isOwner: false,
  approvedAt: null,
};
const APPROVER_PENDING = {
  userId: "u3",
  email: "approver@example.com",
  name: "Батлагч",
  role: "approver" as const,
  addedAt: "2026-05-03T00:00:00Z",
  isOwner: false,
  approvedAt: null,
};
const APPROVER_DONE = {
  ...APPROVER_PENDING,
  approvedAt: "2026-05-04T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ members: [] });
  (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (api.del as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

/* ─── Render ──────────────────────────────────────────────────── */

describe("TeamDialog — owner viewing", () => {
  it("renders add-member form when owner is viewing", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, CHECKER],
    });
    render(<TeamDialog projectId="p1" currentUserId="owner1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-list")).toBeInTheDocument());
    expect(screen.getByTestId("team-add-section")).toBeInTheDocument();
    expect(screen.getByTestId("team-add-email")).toBeInTheDocument();
    expect(screen.getByTestId("team-add-role")).toBeInTheDocument();
  });

  it("renders remove buttons next to non-owner members for owner viewer", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, CHECKER],
    });
    render(<TeamDialog projectId="p1" currentUserId="owner1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-list")).toBeInTheDocument());
    expect(screen.getByTestId("team-remove-u2")).toBeInTheDocument();
    // Owner row should NOT have a remove button
    expect(screen.queryByTestId("team-remove-owner1")).not.toBeInTheDocument();
  });
});

describe("TeamDialog — non-owner viewing", () => {
  it("hides add-member form when checker views", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, CHECKER],
    });
    render(<TeamDialog projectId="p1" currentUserId="u2" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-list")).toBeInTheDocument());
    expect(screen.queryByTestId("team-add-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-remove-u2")).not.toBeInTheDocument();
  });
});

/* ─── Add member ──────────────────────────────────────────────── */

describe("TeamDialog — add member", () => {
  it("POST with userEmail + role", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER],
    });
    render(<TeamDialog projectId="p1" currentUserId="owner1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-add-section")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("team-add-email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByTestId("team-add-role"), { target: { value: "approver" } });
    fireEvent.click(screen.getByTestId("team-add-submit"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/p1/members", {
        userEmail: "new@example.com",
        role: "approver",
      });
    });
  });
});

/* ─── Remove member ───────────────────────────────────────────── */

describe("TeamDialog — remove member", () => {
  it("confirms then DELETEs", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, CHECKER],
    });
    render(<TeamDialog projectId="p1" currentUserId="owner1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-remove-u2")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("team-remove-u2"));
    await waitFor(() => {
      expect(api.del).toHaveBeenCalledWith("/projects/p1/members/u2");
    });
  });
});

/* ─── Approver workflow ───────────────────────────────────────── */

describe("TeamDialog — approver workflow", () => {
  it("shows approve banner + button when approver hasn't acted", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, APPROVER_PENDING],
    });
    render(<TeamDialog projectId="p1" currentUserId="u3" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-approver-prompt")).toBeInTheDocument());
    expect(screen.getByTestId("team-approve")).toBeInTheDocument();
  });

  it("hides approve banner when approver has already acted", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, APPROVER_DONE],
    });
    render(<TeamDialog projectId="p1" currentUserId="u3" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-list")).toBeInTheDocument());
    expect(screen.queryByTestId("team-approver-prompt")).not.toBeInTheDocument();
    expect(screen.getByTestId("team-approved-u3")).toBeInTheDocument();
  });

  it("approve button PUTs the approve endpoint", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      members: [OWNER, APPROVER_PENDING],
    });
    render(<TeamDialog projectId="p1" currentUserId="u3" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("team-approve")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("team-approve"));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/projects/p1/approve", {});
    });
  });
});

/* ─── Close ───────────────────────────────────────────────────── */

describe("TeamDialog — close", () => {
  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<TeamDialog projectId="p1" currentUserId="owner1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("team-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
