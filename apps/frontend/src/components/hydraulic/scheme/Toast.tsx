/**
 * Phase 6.5.2 — minimal ephemeral toast.
 *
 * No external dependency, no global state — the parent component owns
 * a `(message, key) | null` and renders <Toast /> conditionally. The
 * key forces a fresh mount on each message so consecutive identical
 * texts ("3 цэг clipboard-д хуулсан" × 2 quick copies) still re-trigger
 * the fade-in animation.
 *
 * Self-dismisses after `durationMs` (default 2200 ms).
 */
import { useEffect, useState, type CSSProperties } from "react";

export interface ToastProps {
  message: string;
  /** ms before auto-dismiss. Defaults to 2200 ms. */
  durationMs?: number;
  /** Tone — neutral (gray) or success (gold, matches multi-select). */
  tone?: "neutral" | "success";
  /** Called after the fade-out completes so the parent can clear its state. */
  onDismiss?: () => void;
}

export function Toast({
  message,
  durationMs = 2200,
  tone = "neutral",
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), durationMs - 200);
    const t2 = setTimeout(() => onDismiss?.(), durationMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [durationMs, onDismiss]);

  const palette: CSSProperties =
    tone === "success"
      ? { background: "var(--bg-elev, #2a2a2a)", color: "#FFB300", borderColor: "#FFB300" }
      : { background: "var(--bg-elev, #2a2a2a)", color: "var(--fg, #fff)", borderColor: "var(--border, #444)" };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? 0 : -8}px)`,
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease, transform 180ms ease",
        ...palette,
        border: "1px solid",
        padding: "0.5rem 0.85rem",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "var(--font-sans, inherit)",
        zIndex: 50,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
