import { Suspense, lazy, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { HttpError } from "../lib/api";

const HydraulicV5 = lazy(() =>
  import("../components/hydraulic/HydraulicV5").then((m) => ({ default: m.HydraulicV5 })),
);

interface SharedPayload {
  project: {
    id: string;
    name: string;
    description: string | null;
    data: unknown;
  };
  canEdit: boolean;
  readOnly: boolean;
}

export function SharedView() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/shared/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new HttpError(res.status, body, body.message ?? "Олдсонгүй");
        }
        setData(await res.json());
      } catch (e) {
        setErr(e instanceof HttpError ? e.message : "Алдаа гарлаа");
      }
    })();
  }, [token]);

  if (err) {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <h2>Хуваалцсан холбоос олдсонгүй</h2>
        <p style={{ color: "var(--fg-muted)" }}>{err}</p>
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: "3rem", textAlign: "center", color: "var(--fg-muted)" }}>Ачаалж байна...</div>;
  }

  return (
    <>
      <div
        style={{
          background: "var(--accent-bg)",
          borderBottom: "1px solid var(--accent-dim)",
          padding: "0.5rem 1rem",
          fontSize: 13,
          textAlign: "center",
          color: "var(--accent)",
        }}
      >
        📖 Зөвхөн харах горим — &quot;{data.project.name}&quot;
      </div>
      <div style={{ height: "calc(100vh - 58px - 34px)" }}>
        <Suspense fallback={<div style={{ padding: "2rem" }}>Ачааллаж байна...</div>}>
          <HydraulicV5 readOnly sharedData={data.project.data} />
        </Suspense>
      </div>
    </>
  );
}
