import { forwardRef, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, style, id, ...rest },
  ref,
) {
  const uid = id ?? `in-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "0.9rem" }}>
      {label && (
        <label htmlFor={uid} style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 500 }}>
          {label}
        </label>
      )}
      <input
        id={uid}
        ref={ref}
        {...rest}
        style={{
          background: "var(--bg)",
          color: "var(--fg)",
          border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          padding: "0.55rem 0.8rem",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 120ms",
          ...style,
        }}
      />
      {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
      {!error && hint && <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>{hint}</span>}
    </div>
  );
});
