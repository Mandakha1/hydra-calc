/**
 * Phase 6.5 batch-ops toolbar — UI tests.
 *
 * What we lock:
 *   - Renders with 7 operation buttons (3 rotate + 2 mirror + 2 array)
 *   - All transform buttons disabled when multi-selection is empty
 *   - Selecting nodes enables buttons + shows count badge
 *   - Clicking rotate button mutates selected node positions
 *   - Clicking array button opens the linear/polar dialog
 *   - Dialog cancel closes without inserting; submit inserts copies
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchOpsToolbar } from "../scheme/BatchOpsToolbar";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("BatchOpsToolbar — Phase 6.5", () => {
  it("renders 7 batch-op buttons with Mongolian tooltips", () => {
    render(<BatchOpsToolbar />);
    expect(screen.getByTitle(/Цагийн зүүний эсрэг 90/)).toBeInTheDocument();
    expect(screen.getByTitle(/Цагийн зүүгээр 90/)).toBeInTheDocument();
    expect(screen.getByTitle(/180/)).toBeInTheDocument();
    expect(screen.getByTitle(/Хэвтээ тэнхлэгээр/)).toBeInTheDocument();
    expect(screen.getByTitle(/Босоо тэнхлэгээр/)).toBeInTheDocument();
    expect(screen.getByTitle(/Шугаман массив/)).toBeInTheDocument();
    expect(screen.getByTitle(/Радиал массив/)).toBeInTheDocument();
  });

  it("all transform buttons disabled when multi-selection is empty", () => {
    render(<BatchOpsToolbar />);
    expect(screen.getByTitle(/Цагийн зүүний эсрэг 90/)).toBeDisabled();
    expect(screen.getByTitle(/Цагийн зүүгээр 90/)).toBeDisabled();
    expect(screen.getByTitle(/180/)).toBeDisabled();
    expect(screen.getByTitle(/Хэвтээ тэнхлэгээр/)).toBeDisabled();
    expect(screen.getByTitle(/Босоо тэнхлэгээр/)).toBeDisabled();
    expect(screen.getByTitle(/Шугаман массив/)).toBeDisabled();
    expect(screen.getByTitle(/Радиал массив/)).toBeDisabled();
  });

  it("selecting nodes enables buttons + shows count badge", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    render(<BatchOpsToolbar />);
    expect(screen.getByTitle(/Цагийн зүүний эсрэг 90/)).not.toBeDisabled();
    expect(screen.getByTestId("batch-ops-count").textContent).toBe("2");
  });

  it("clicking 'rotate CCW' mutates selected node positions in the store", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Цагийн зүүний эсрэг 90/));
    // After 90° CCW around centroid (50, 0):
    //   A (0, 0) → (50, -50)
    //   B (100, 0) → (50, 50)
    const after = useHydraulicStore.getState();
    expect(after.nodes.find((n) => n.id === "a")!.x).toBe(50);
    expect(after.nodes.find((n) => n.id === "a")!.y).toBe(-50);
    expect(after.nodes.find((n) => n.id === "b")!.x).toBe(50);
    expect(after.nodes.find((n) => n.id === "b")!.y).toBe(50);
  });

  it("'rotate 180' button flips coordinates around centroid", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/180/));
    const after = useHydraulicStore.getState();
    expect(after.nodes.find((n) => n.id === "a")!.x).toBe(100);
    expect(after.nodes.find((n) => n.id === "b")!.x).toBe(0);
  });

  it("clicking 'mirror horizontal' flips both nodes across centroid Y", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 0, y: 100 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Хэвтээ тэнхлэгээр/));
    const after = useHydraulicStore.getState();
    expect(after.nodes.find((n) => n.id === "a")!.y).toBe(100);
    expect(after.nodes.find((n) => n.id === "b")!.y).toBe(0);
  });

  it("clicking 'linear array' opens the modal dialog", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Шугаман массив/));
    expect(screen.getByTestId("linear-array-dialog")).toBeInTheDocument();
    // Should have the Mongolian field labels visible.
    expect(screen.getByText(/Мөр \(rows\)/)).toBeInTheDocument();
    expect(screen.getByText(/Багана \(cols\)/)).toBeInTheDocument();
  });

  it("clicking 'polar array' opens the modal dialog", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Радиал массив/));
    expect(screen.getByTestId("polar-array-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Хувилбарын тоо/)).toBeInTheDocument();
  });

  it("linear-dialog submit inserts copies into the store", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Шугаман массив/));
    // Default is 1×5, so 4 copies after submit.
    fireEvent.click(screen.getByText("Үүсгэх"));
    const after = useHydraulicStore.getState();
    // Original + 4 copies = 5 nodes total.
    expect(after.nodes).toHaveLength(5);
    // Dialog closed.
    expect(screen.queryByTestId("linear-array-dialog")).toBeNull();
  });

  it("linear-dialog cancel closes without inserting", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Шугаман массив/));
    fireEvent.click(screen.getByText("Цуцлах"));
    // Only the original node.
    expect(useHydraulicStore.getState().nodes).toHaveLength(1);
    expect(screen.queryByTestId("linear-array-dialog")).toBeNull();
  });

  it("polar-dialog submit inserts copies with auto-centroid centre", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 100, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    render(<BatchOpsToolbar />);
    fireEvent.click(screen.getByTitle(/Радиал массив/));
    // Default is count=8, sweep=360. The dialog's default centre is
    // the selection's centroid (= the node itself at 100, 0), which
    // makes radius=0 → all copies pile at the centre. To get a real
    // polar layout we move the centre to origin first.
    const xInput = screen.getAllByRole("spinbutton")[1]!; // count, X, Y, sweep
    fireEvent.change(xInput, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Үүсгэх"));
    // Original + 7 polar copies = 8 nodes total.
    const after = useHydraulicStore.getState();
    expect(after.nodes).toHaveLength(8);
  });
});
