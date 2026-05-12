import type { ReactElement } from "react";
import type { EntityKind } from "../symbolSize";
import { SourceSymbol } from "./SourceSymbol";
import { ConsumerSymbol } from "./ConsumerSymbol";
import { WellSymbol } from "./WellSymbol";
import { FixedSupportSymbol } from "./FixedSupportSymbol";
import { ElbowSymbol } from "./ElbowSymbol";
import { CompensatorSymbol } from "./CompensatorSymbol";
import { ValveSymbol } from "./ValveSymbol";
import { JunctionSymbol } from "./JunctionSymbol";
import type { SymbolProps } from "./types";

/**
 * Router: map an EntityKind to the matching symbol component.
 *
 * Pure rendering function — caller passes the resolved EntityKind
 * (from `resolveEntityKind` in symbolSize.ts) plus the standard
 * props (radius / color / selected) and gets the right SVG back.
 *
 * For "pump" we fall back to JunctionSymbol — pumps usually live
 * inside a building (УДДТ), so a separate icon is rarely needed.
 * Phase 7+ can add a dedicated PumpSymbol if it earns its bytes.
 */
export function renderSymbolFor(
  kind: EntityKind,
  props: SymbolProps,
): ReactElement {
  switch (kind) {
    case "source":
      return <SourceSymbol {...props} />;
    case "consumer":
      return <ConsumerSymbol {...props} />;
    case "well":
      return <WellSymbol {...props} />;
    case "fixedSupport":
      return <FixedSupportSymbol {...props} />;
    case "elbow":
      return <ElbowSymbol {...props} />;
    case "compensator":
      return <CompensatorSymbol {...props} />;
    case "valve":
      return <ValveSymbol {...props} />;
    case "pump":
    case "junction":
    default:
      return <JunctionSymbol {...props} />;
  }
}
