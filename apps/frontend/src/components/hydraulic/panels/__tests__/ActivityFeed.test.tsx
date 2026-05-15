/**
 * Phase 10.4 — ActivityFeed tab tests.
 *
 * Mocks the api module so we don't hit the backend. Asserts render
 * states (no project / empty / populated / paginated) and load-more
 * interactions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ActivityFeed } from "../ActivityFeed";

vi.mock("../../../../lib/api", () => ({
  api: { get: vi.fn() },
  HttpError: class extends Error {},
}));

import { api } from "../../../../lib/api";

beforeEach(() => {
  vi.clearAllMocks();
});

/* ─── No project state ─────────────────────────────────────────── */

describe("ActivityFeed — no project", () => {
  it("renders 'no project saved' message when projectId missing", () => {
    render(<ActivityFeed />);
    expect(screen.getByTestId("activity-no-project")).toBeInTheDocument();
  });

  it("doesn't call API when no projectId", () => {
    render(<ActivityFeed projectId={null} />);
    expect(api.get).not.toHaveBeenCalled();
  });
});

/* ─── Empty + populated ───────────────────────────────────────── */

describe("ActivityFeed — empty + populated", () => {
  it("renders empty-state when no entries returned", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [],
      hasMore: false,
    });
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-empty")).toBeInTheDocument());
  });

  it("renders list when entries returned", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [
        { id: "e1", action: "project.create", entityType: "project", entityId: "p1", details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" },
        { id: "e2", action: "login", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T09:00:00Z" },
      ],
      hasMore: false,
    });
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-list")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("maps technical actions to Mongolian verbs", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [
        { id: "e1", action: "project.create", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" },
        { id: "e2", action: "share.created", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" },
        { id: "e3", action: "compliance.check.run", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" },
      ],
      hasMore: false,
    });
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-list")).toBeInTheDocument());
    const txt = screen.getByTestId("activity-list").textContent ?? "";
    expect(txt).toMatch(/Төсөл үүсгэсэн/);
    expect(txt).toMatch(/Хуваалцах токен үүсгэсэн/);
    expect(txt).toMatch(/Стандарт шалгасан/);
  });

  it("calls API with correct URL + limit", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ entries: [], hasMore: false });
    render(<ActivityFeed projectId="proj42" />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/projects\/proj42\/audit\?/));
      expect((api.get as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatch(/limit=50/);
    });
  });
});

/* ─── Pagination (load more) ──────────────────────────────────── */

describe("ActivityFeed — pagination", () => {
  it("shows 'load more' button when hasMore=true", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ id: "e1", action: "login", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" }],
      hasMore: true,
    });
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-load-more")).toBeInTheDocument());
  });

  it("hides 'load more' button when hasMore=false", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ id: "e1", action: "login", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" }],
      hasMore: false,
    });
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-list")).toBeInTheDocument());
    expect(screen.queryByTestId("activity-load-more")).not.toBeInTheDocument();
  });

  it("load more passes 'before' query param with oldest timestamp", async () => {
    const mock = api.get as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({
      entries: [
        { id: "e1", action: "login", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T10:00:00Z" },
        { id: "e2", action: "login", entityType: null, entityId: null, details: null, userId: "u1", createdAt: "2026-05-15T09:00:00Z" },
      ],
      hasMore: true,
    });
    mock.mockResolvedValueOnce({ entries: [], hasMore: false });
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-load-more")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("activity-load-more"));
    await waitFor(() => {
      const lastCall = mock.mock.calls[mock.mock.calls.length - 1]![0] as string;
      expect(lastCall).toMatch(/before=/);
      expect(decodeURIComponent(lastCall)).toMatch(/2026-05-15T09:00:00/);
    });
  });
});

/* ─── Error handling ──────────────────────────────────────────── */

describe("ActivityFeed — errors", () => {
  it("renders error banner on API failure", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    render(<ActivityFeed projectId="proj1" />);
    await waitFor(() => expect(screen.getByTestId("activity-err")).toBeInTheDocument());
  });
});
