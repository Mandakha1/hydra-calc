import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({ variant = "primary", size = "md", style, children, ...rest }: Props) {
  const sizeStyles: Record<string, CSSProperties> = {
    sm: { padding: "0.35rem 0.8rem", fontSize: 13 },
    md: { padding: "0.55rem 1.1rem", fontSize: 14 },
    lg: { padding: "0.75rem 1.5rem", fontSize: 15 },
  };
  const variants: Record<string, CSSProperties> = {
    primary: {
      background: "var(--accent)",
      color: "#0b1117",
      border: "1px solid var(--accent)",
      fontWeight: 600,
    },
    secondary: {
      background: "var(--bg-elev)",
      color: "var(--fg)",
      border: "1px solid var(--border)",
    },
    ghost: {
      background: "transparent",
      color: "var(--fg-muted)",
      border: "1px solid transparent",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      border: "1px solid var(--danger)",
    },
  };
  return (
    <button
      {...rest}
      style={{
        borderRadius: "var(--radius)",
        transition: "all 120ms ease",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5em",
        ...sizeStyles[size],
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
