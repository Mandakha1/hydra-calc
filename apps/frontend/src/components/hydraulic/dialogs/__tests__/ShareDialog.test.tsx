/**
 * Phase 10.3 — Share dialog tests.
 *
 * Mocks the api module so we don't hit a backend. Asserts render +
 * core interactions (create, copy, revoke).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareDialog } from "../ShareDialog";

// Mock the api module
vi.mock("../../../../lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
  },
  HttpError: class extends Error {},
}));

import { api } from "../../../../lib/api";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty shares list
  (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ shares: [] });
  (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ token: "TEST_TOKEN_XYZ", url: "/shared/TEST_TOKEN_XYZ" });
  (api.del as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  // jsdom doesn't ship navigator.clipboard
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("ShareDialog — render", () => {
  it("renders dialog with title + close button", () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    expect(screen.getByTestId("share-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("share-close")).toBeInTheDocument();
  });

  it("renders expiry dropdown with 5 options", () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    const select = screen.getByTestId("share-expiry-select") as HTMLSelectElement;
    expect(select.querySelectorAll("option").length).toBe(5);
  });

  it("renders empty-state when no shares", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-empty")).toBeInTheDocument());
  });

  it("loads existing shares on mount via /projects/:id/shares", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/projects/proj1/shares"));
  });
});

describe("ShareDialog — create", () => {
  it("create button calls POST /share with expiry seconds", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-empty")).toBeInTheDocument());
    // Default expiry "1w" = 7 days = 604800 seconds
    fireEvent.click(screen.getByTestId("share-create"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/proj1/share", {
        canEdit: false,
        expiresInSeconds: 7 * 24 * 60 * 60,
      });
    });
  });

  it("'never' expiry omits expiresInSeconds", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-empty")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("share-expiry-select"), { target: { value: "never" } });
    fireEvent.click(screen.getByTestId("share-create"));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/proj1/share", {
        canEdit: false,
      });
    });
  });

  it("success message shows just-created URL", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-empty")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("share-create"));
    await waitFor(() => {
      expect(screen.getByTestId("share-just-created")).toBeInTheDocument();
      expect(screen.getByTestId("share-just-created").textContent).toMatch(/TEST_TOKEN_XYZ/);
    });
  });

  it("auto-copies URL to clipboard after create", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-empty")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("share-create"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });
});

describe("ShareDialog — list + revoke", () => {
  beforeEach(() => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      shares: [
        {
          id: "s1",
          token: "TOK_A_PROD_TOKEN_AAA",
          canEdit: false,
          expiresAt: null,
          createdAt: "2026-05-15T10:00:00Z",
          active: true,
        },
        {
          id: "s2",
          token: "TOK_B_EXPIRED_BBB",
          canEdit: false,
          expiresAt: "2025-01-01T00:00:00Z",
          createdAt: "2024-12-30T10:00:00Z",
          active: false,
        },
      ],
    });
  });

  it("renders list with copy + revoke buttons", async () => {
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-list")).toBeInTheDocument());
    expect(screen.getByTestId("share-copy-s1")).toBeInTheDocument();
    expect(screen.getByTestId("share-revoke-s1")).toBeInTheDocument();
  });

  it("revoke confirms then DELETEs", async () => {
    // Mock window.confirm to auto-accept
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-list")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("share-revoke-s1"));
    await waitFor(() => {
      expect(api.del).toHaveBeenCalledWith("/projects/proj1/shares/s1");
    });
  });

  it("cancel on confirm skips DELETE", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ShareDialog projectId="proj1" onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-list")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("share-revoke-s1"));
    expect(api.del).not.toHaveBeenCalled();
  });
});

describe("ShareDialog — close", () => {
  it("X button calls onClose", () => {
    const onClose = vi.fn();
    render(<ShareDialog projectId="proj1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("share-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking overlay calls onClose", () => {
    const onClose = vi.fn();
    render(<ShareDialog projectId="proj1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("share-dialog-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
