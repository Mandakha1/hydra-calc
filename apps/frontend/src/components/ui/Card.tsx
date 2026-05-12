import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  style?: CSSProperties;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, style, hover, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-lg)",
        padding: "1.25rem",
        cursor: onClick ? "pointer" : "default",
        transition: hover || onClick ? "transform 140ms, border-color 140ms, box-shadow 140ms" : undefined,
        ...style,
      }}
      onMouseEnter={
        hover || onClick
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
            }
          : undefined
      }
      onMouseLeave={
        hover || onClick
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-soft)";
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
