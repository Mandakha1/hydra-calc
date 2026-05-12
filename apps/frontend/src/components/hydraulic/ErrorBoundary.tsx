import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Hydraulic ErrorBoundary caught:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2 style={{ color: "var(--danger)" }}>Тооцоонд алдаа гарлаа</h2>
          <p style={{ color: "var(--fg-muted)" }}>
            Схем эсвэл тооцоо гэнэтийн төлөвт оров. Хуудсыг дахин ачаалж үзнэ үү.
          </p>
          <pre
            style={{
              margin: "1rem auto",
              maxWidth: 600,
              textAlign: "left",
              padding: "1rem",
              background: "var(--bg-card)",
              borderRadius: 6,
              overflow: "auto",
              fontSize: 12,
              color: "var(--fg-dim)",
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              padding: "0.5rem 1rem",
              background: "var(--accent)",
              color: "#0b1117",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Дахин оролдох
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
