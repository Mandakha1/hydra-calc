/**
 * Phase 11.3 — Compliance check Web Worker.
 *
 * Runs the 30-rule registry off the main thread. For 1000+ node
 * projects the synchronous check can take 100-500ms, which freezes
 * the editor canvas. Off-loading to a worker keeps pan/zoom at
 * 60fps while the check runs.
 *
 * Message protocol:
 *   IN:  { type: "run", project: HydraulicState, calc?: CalculationResults }
 *   OUT: { type: "report", report: ComplianceReport, elapsedMs: number }
 *
 * Architectural notes:
 *   - The worker imports the rule engine + rules registry directly,
 *     same modules as the main-thread `ComplianceView`. No
 *     duplication.
 *   - Worker is created lazily on first run via the
 *     `compliance.worker.ts?worker` Vite import syntax (resolved at
 *     build time into a separate chunk that the worker bootstrap
 *     loads).
 *   - When the worker isn't supported (legacy browser, SSR), the
 *     `runComplianceCheckAsync` wrapper falls back to synchronous
 *     execution on the main thread. Zero engineer-visible diff
 *     except the < 60fps pause.
 *
 * Threading model: one worker per ComplianceView instance, kept
 * alive for the session. Engineer pressing "Шалгалт хийх" multiple
 * times reuses the same worker.
 */

import { runComplianceCheck, type ComplianceReport } from "./ruleEngine";
import { ALL_RULES } from "./rules";
import type { HydraulicState, CalculationResults } from "../../hydraulicTypes";

export interface WorkerInMessage {
  type: "run";
  project: HydraulicState;
  calc?: CalculationResults;
}

export interface WorkerOutMessage {
  type: "report";
  report: ComplianceReport;
  elapsedMs: number;
}

/**
 * Worker entry — runs the rule registry against the incoming project
 * + calc payload. This file is loaded as a Web Worker via the
 * `?worker` Vite import in the consumer code; the export is just for
 * type sharing.
 *
 * Important: don't call this function from main thread code. It uses
 * `self.onmessage` / `postMessage` which only exist in worker scope.
 */
// `self` is the worker's global scope. In main-thread context it's
// the window. We use a duck-typed declaration so TypeScript doesn't
// require the WebWorker lib.
declare const self: {
  onmessage: ((e: MessageEvent<WorkerInMessage>) => void) | null;
  postMessage: (msg: WorkerOutMessage) => void;
};

// Wire up the message handler only when running inside a worker.
// (Vite's worker chunks set `globalThis.importScripts` so the typeof
//  check works; in tests this branch is skipped.)
if (typeof self !== "undefined" && "onmessage" in self) {
  self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
    const msg = e.data;
    if (msg.type !== "run") return;
    const t0 = performance.now();
    const report = runComplianceCheck(msg.project, msg.calc, ALL_RULES);
    const t1 = performance.now();
    const out: WorkerOutMessage = {
      type: "report",
      report,
      elapsedMs: t1 - t0,
    };
    self.postMessage(out);
  };
}

/**
 * Main-thread helper that wraps Worker creation + RPC + fallback.
 * Returns a Promise that resolves with the report.
 *
 * Use this from the ComplianceView panel instead of calling
 * `runComplianceCheck` directly. The Promise resolves with the
 * report; UI can show a loading state during the wait.
 *
 * Lazy: the worker is constructed on first call and cached for the
 * page lifetime.
 */
let cachedWorker: Worker | null = null;
let cachedWorkerErrored = false;

export function runComplianceCheckAsync(
  project: HydraulicState,
  calc: CalculationResults | undefined,
): Promise<{ report: ComplianceReport; elapsedMs: number; offMainThread: boolean }> {
  return new Promise((resolve) => {
    // Fallback path: synchronous on main thread.
    const runSync = (): void => {
      const t0 = performance.now();
      const report = runComplianceCheck(project, calc, ALL_RULES);
      const t1 = performance.now();
      resolve({ report, elapsedMs: t1 - t0, offMainThread: false });
    };

    // Browser support check.
    if (typeof Worker === "undefined" || cachedWorkerErrored) {
      runSync();
      return;
    }

    try {
      if (!cachedWorker) {
        // Vite-resolved worker URL. The `?worker` query tells Vite to
        // bundle this module as a separate worker chunk.
        // Note: in unit tests (jsdom) the dynamic import fails — we
        // catch + fall back to sync below.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cachedWorker = new (Worker as any)(
          new URL("./complianceWorker.ts", import.meta.url),
          { type: "module" },
        );
      }
      const worker = cachedWorker!;
      const onMessage = (e: MessageEvent<WorkerOutMessage>) => {
        worker.removeEventListener("message", onMessage);
        if (e.data.type === "report") {
          resolve({ report: e.data.report, elapsedMs: e.data.elapsedMs, offMainThread: true });
        } else {
          runSync();
        }
      };
      worker.addEventListener("message", onMessage);
      const msg: WorkerInMessage = { type: "run", project, calc };
      worker.postMessage(msg);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[compliance-worker] init failed, falling back to sync:", err);
      cachedWorkerErrored = true;
      runSync();
    }
  });
}

/** Reset the cached worker — useful for tests + HMR. */
export function resetComplianceWorkerCache(): void {
  if (cachedWorker) {
    cachedWorker.terminate();
    cachedWorker = null;
  }
  cachedWorkerErrored = false;
}
