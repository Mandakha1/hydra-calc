import { Suspense, lazy, useEffect } from "react";
import { useParams } from "react-router-dom";
import { installGlobalStorage } from "../lib/storage";

const HydraulicV5 = lazy(() =>
  import("../components/hydraulic/HydraulicV5").then((m) => ({ default: m.HydraulicV5 })),
);

export function HydraulicApp({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams<{ id?: string }>();

  useEffect(() => {
    installGlobalStorage();
  }, []);

  return (
    <div style={{ height: "calc(100vh - 58px)", overflow: "hidden" }}>
      <Suspense fallback={<Loading />}>
        <HydraulicV5 projectId={id === "new" ? undefined : id} readOnly={readOnly} />
      </Suspense>
    </div>
  );
}

function Loading() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fg-muted)",
      }}
    >
      Схем ачааллаж байна...
    </div>
  );
}
