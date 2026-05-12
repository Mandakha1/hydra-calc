/**
 * Minimal DXF R14 writer — no external dep.
 * Produces 3 layers: PIPES, NODES, TEXT — AutoCAD 2000+ compatible.
 *
 * Format reference: https://ezdxf.mozman.at/docs/dxfinternals/overview.html
 */
import type { HydraulicState } from "../hydraulicTypes";

interface DxfWriter {
  g(code: number, value: string | number): void;
  toString(): string;
}

function newWriter(): DxfWriter {
  const lines: string[] = [];
  return {
    g(code, value) {
      lines.push(code.toString());
      lines.push(typeof value === "number" ? value.toString() : value);
    },
    toString() {
      return lines.join("\r\n") + "\r\n";
    },
  };
}

function header(w: DxfWriter) {
  w.g(0, "SECTION");
  w.g(2, "HEADER");
  w.g(9, "$ACADVER");
  w.g(1, "AC1014"); // R14
  w.g(9, "$INSBASE");
  w.g(10, 0);
  w.g(20, 0);
  w.g(30, 0);
  w.g(9, "$EXTMIN");
  w.g(10, 0);
  w.g(20, 0);
  w.g(9, "$EXTMAX");
  w.g(10, 1000);
  w.g(20, 1000);
  w.g(0, "ENDSEC");
}

function tables(w: DxfWriter) {
  w.g(0, "SECTION");
  w.g(2, "TABLES");

  // LAYER table
  w.g(0, "TABLE");
  w.g(2, "LAYER");
  w.g(70, 3);
  layer(w, "PIPES", 5);
  layer(w, "NODES", 3);
  layer(w, "TEXT", 7);
  w.g(0, "ENDTAB");

  w.g(0, "ENDSEC");
}

function layer(w: DxfWriter, name: string, color: number) {
  w.g(0, "LAYER");
  w.g(2, name);
  w.g(70, 0);
  w.g(62, color);
  w.g(6, "CONTINUOUS");
}

function entities(w: DxfWriter, state: HydraulicState) {
  w.g(0, "SECTION");
  w.g(2, "ENTITIES");

  // Pipes as LINE
  for (const pipe of state.pipes) {
    const a = state.nodes.find((n) => n.id === pipe.fromNodeId);
    const b = state.nodes.find((n) => n.id === pipe.toNodeId);
    if (!a || !b) continue;
    w.g(0, "LINE");
    w.g(8, "PIPES");
    w.g(10, a.x);
    w.g(20, -a.y); // DXF Y is up; screen Y is down. Invert.
    w.g(30, 0);
    w.g(11, b.x);
    w.g(21, -b.y);
    w.g(31, 0);
  }

  // Nodes as CIRCLE + label
  for (const node of state.nodes) {
    w.g(0, "CIRCLE");
    w.g(8, "NODES");
    w.g(10, node.x);
    w.g(20, -node.y);
    w.g(30, 0);
    w.g(40, 4); // radius
    labelText(w, node.x + 8, -node.y - 8, node.label);
    if (node.heatLoad_w && node.heatLoad_w > 0) {
      labelText(w, node.x + 8, -node.y + 8, `${(node.heatLoad_w / 1000).toFixed(0)} kW`);
    }
  }

  // Pipe labels (DN, length)
  for (const pipe of state.pipes) {
    const a = state.nodes.find((n) => n.id === pipe.fromNodeId);
    const b = state.nodes.find((n) => n.id === pipe.toNodeId);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const my = -(a.y + b.y) / 2;
    labelText(w, mx, my + 4, `DN${pipe.dn} × ${pipe.length_m.toFixed(1)}m`);
    const r = state.results?.pipes.find((x) => x.pipeId === pipe.id);
    if (r) {
      labelText(w, mx, my - 4, `v=${r.v_m_s.toFixed(2)} ΔP=${(r.totalPressureDrop_pa / 1000).toFixed(1)}kPa`);
    }
  }

  w.g(0, "ENDSEC");
}

function labelText(w: DxfWriter, x: number, y: number, text: string) {
  w.g(0, "TEXT");
  w.g(8, "TEXT");
  w.g(10, x);
  w.g(20, y);
  w.g(30, 0);
  w.g(40, 3); // height
  w.g(1, text);
}

export function exportToDXF(state: HydraulicState): string {
  const w = newWriter();
  header(w);
  tables(w);
  entities(w, state);
  w.g(0, "EOF");
  return w.toString();
}

export function downloadDXF(state: HydraulicState, filename = "hydra-calc.dxf"): void {
  const content = exportToDXF(state);
  const blob = new Blob([content], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
