/**
 * Phase 12.12 — Channel-aware compliance rules (БНбД 41-02-13 §6).
 *
 * Three rules covering the Phase 12.5 SchemeChannel entity:
 *
 *   1. channel_clearance_min — minimum vertical clearance above the
 *      contained pipes. Per БНбД 41-02-13 §6.2 the engineer must
 *      leave at least 100 mm between the largest pipe's top and the
 *      channel ceiling for maintenance access. Rule fires when a
 *      pipe's outer diameter + bottom clearance (~80 mm) + insulation
 *      thickness exceeds the channel's inside height.
 *
 *   2. channel_insulation_required — every channel-contained pipe
 *      must declare an insulationKey + thickness when burial depth
 *      is > 0.5 m (no-insulation pipes leak heat into the ground).
 *      Fires per pipe inside a channel that lacks the fields.
 *
 *   3. channel_dimension_match — the channel's stored crossSection*
 *      dimensions must agree with the CHANNEL_TYPE_REGISTRY entry
 *      for the declared channelType (except 'custom'). Fires when a
 *      Phase 12.5 channel was created with stale dimensions (e.g.
 *      engineer typed Л-9 but kept old Л-7 dims).
 *
 * Each rule emits at most one RuleResult per channel — engineer can
 * see the violating channel highlighted on plan via entityType =
 * "pipe" (pointing at the first contained pipe; full channel-level
 * highlighting is a Phase 12.13+ UI polish).
 */
import type {
  Rule,
  RuleResult,
} from "./ruleEngine";
import {
  CHANNEL_TYPE_REGISTRY,
  type ChannelTypeKey,
} from "../../scheme/channelTypes";

/** Minimum vertical clearance between top-of-pipe and channel ceiling
 *  per БНбД 41-02-13 §6.2 (engineer maintenance access). */
export const CHANNEL_TOP_CLEARANCE_MIN_MM = 100;
/** Standard sleeper height inside the channel (Phase 12.6 cross-
 *  section uses 80 mm). Pipes rest on this above the floor. */
export const CHANNEL_BOTTOM_SLEEPER_MM = 80;
/** Burial depth above which insulation becomes mandatory per БНбД
 *  41-02-13 §6.3 (shallower lines below 0.5 m are exempted as
 *  "service-line / inspection" runs). */
export const CHANNEL_BURIAL_DEPTH_REQUIRES_INSULATION_M = 0.5;

/* ─── Rule 1: clearance ──────────────────────────────────────── */

export const channelClearanceMin: Rule = {
  id: "channel_clearance_min",
  category: "geometry",
  severity: "error",
  name: "Сувгийн дээд зайлгуй",
  description:
    "Хамгийн том диаметртэй хоолойн дээд хэсгээс сувгийн тааз хүртэл хамгийн багадаа " +
    `${CHANNEL_TOP_CLEARANCE_MIN_MM} мм зай байх ёстой (засвар үйлчилгээний нөхцөл).`,
  standardRef: "БНбД 41-02-13 §6.2",
  check(project) {
    const out: RuleResult[] = [];
    for (const channel of project.channels ?? []) {
      const containedPipes = project.pipes.filter((p) =>
        channel.pipeIds.includes(p.id),
      );
      if (containedPipes.length === 0) continue;
      // Largest pipe OD (DN as approx OD per Mongolian practice up to
      // DN 200) + insulation thickness if any.
      const largestPipe = containedPipes.reduce(
        (best, p) => {
          const od_mm = p.dn + 2 * (p.insulationThickness_mm ?? 0);
          return od_mm > best.od_mm ? { pipe: p, od_mm } : best;
        },
        { pipe: containedPipes[0]!, od_mm: containedPipes[0]!.dn },
      );

      const height_mm = effectiveHeight(channel);
      if (height_mm <= 0) continue; // Skip channels with no dimensions
      const usedHeight_mm = CHANNEL_BOTTOM_SLEEPER_MM + largestPipe.od_mm;
      const clearance_mm = height_mm - usedHeight_mm;
      if (clearance_mm < CHANNEL_TOP_CLEARANCE_MIN_MM) {
        out.push({
          ruleId: "channel_clearance_min",
          severity: "error",
          message:
            `Суваг (${channel.channelType ?? "тодорхойгүй"}) дээд зай ${Math.round(clearance_mm)} мм — ` +
            `шаардлагатай: ${CHANNEL_TOP_CLEARANCE_MIN_MM} мм. ` +
            `Хамгийн том хоолой Φ${largestPipe.pipe.dn} мм + ${CHANNEL_BOTTOM_SLEEPER_MM} мм тулгуур = ${usedHeight_mm} мм / ${height_mm} мм.`,
          entityType: "pipe",
          entityId: largestPipe.pipe.id,
          fixHint:
            "Том хэмжээтэй суваг сонгох (Л-7 → Л-9), эсвэл DN бууруулах.",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 2: insulation required ────────────────────────────── */

export const channelInsulationRequired: Rule = {
  id: "channel_insulation_required",
  category: "thermal",
  severity: "warn",
  name: "Сувгийн дулаалга алга",
  description:
    "Газар доорх сувагт (булшилтын гүн > " +
    `${CHANNEL_BURIAL_DEPTH_REQUIRES_INSULATION_M} м) орсон бүх хоолой дулаалгатай байх ёстой.`,
  standardRef: "БНбД 41-02-13 §6.3",
  check(project) {
    const out: RuleResult[] = [];
    for (const channel of project.channels ?? []) {
      const depth_m = channel.burialDepth_m ?? 0;
      if (depth_m <= CHANNEL_BURIAL_DEPTH_REQUIRES_INSULATION_M) continue;
      const containedPipes = project.pipes.filter((p) =>
        channel.pipeIds.includes(p.id),
      );
      for (const pipe of containedPipes) {
        const lacksInsulation =
          !pipe.insulationKey ||
          typeof pipe.insulationThickness_mm !== "number" ||
          pipe.insulationThickness_mm <= 0;
        if (lacksInsulation) {
          out.push({
            ruleId: "channel_insulation_required",
            severity: "warn",
            message:
              `Хоолой ${pipe.id} (Φ${pipe.dn}) сувагт орсон ч дулаалга алга ` +
              `(булшилтын гүн ${depth_m.toFixed(1)} м).`,
            entityType: "pipe",
            entityId: pipe.id,
            fixHint:
              "Inspector → Дулаалга талбараас insulationKey + insulationThickness_mm тогтоо.",
          });
        }
      }
    }
    return out;
  },
};

/* ─── Rule 3: dimension match ─────────────────────────────── */

export const channelDimensionMatch: Rule = {
  id: "channel_dimension_match",
  category: "geometry",
  severity: "warn",
  name: "Сувгийн хэмжээ зөрүү",
  description:
    "Сувгийн стандарт төрөл (Л-4 / Л-7 / Л-9) ба сэйфт хадгалсан " +
    "хэмжээ нь зөрүүтэй байж болохгүй. ГК-23/02 СЕРИЯ Г-991-1 dim-аас " +
    "тэрхүү хэмжээг автоматаар авна.",
  standardRef: "ГК-23/02 СЕРИЯ Г-991-1",
  check(project) {
    const out: RuleResult[] = [];
    for (const channel of project.channels ?? []) {
      if (!channel.channelType || channel.channelType === "custom") continue;
      const spec = CHANNEL_TYPE_REGISTRY[channel.channelType as Exclude<ChannelTypeKey, "custom">];
      if (!spec) continue;
      const storedW = channel.crossSectionWidth_mm;
      const storedH = channel.crossSectionHeight_mm;
      if (
        typeof storedW === "number" &&
        typeof storedH === "number" &&
        (storedW !== spec.widthMm || storedH !== spec.heightMm)
      ) {
        const firstPipeId = channel.pipeIds[0];
        out.push({
          ruleId: "channel_dimension_match",
          severity: "warn",
          message:
            `Суваг ${channel.channelType} нь хадгалсан хэмжээ ${storedW}×${storedH} мм — ` +
            `стандарт ${spec.widthMm}×${spec.heightMm} мм.`,
          ...(firstPipeId
            ? { entityType: "pipe" as const, entityId: firstPipeId }
            : { entityType: "project" as const }),
          fixHint:
            "Right-click сувгийн дээр → 'Сувгийн төрөл солих' дарж стандартыг сэргээнэ үү.",
        });
      }
    }
    return out;
  },
};

/* ─── Helpers ────────────────────────────────────────────────── */

/** Effective inside height for clearance math. Explicit field wins;
 *  standard types fall back to registry; custom without explicit
 *  field returns 0 → rule skips (engineer hasn't set dims yet). */
function effectiveHeight(channel: {
  crossSectionHeight_mm?: number;
  channelType?: ChannelTypeKey;
}): number {
  if (typeof channel.crossSectionHeight_mm === "number" && channel.crossSectionHeight_mm > 0) {
    return channel.crossSectionHeight_mm;
  }
  if (channel.channelType && channel.channelType !== "custom") {
    return CHANNEL_TYPE_REGISTRY[channel.channelType as Exclude<ChannelTypeKey, "custom">].heightMm;
  }
  return 0;
}

/** Convenience array — caller can spread into ALL_RULES. */
export const CHANNEL_RULES: ReadonlyArray<Rule> = [
  channelClearanceMin,
  channelInsulationRequired,
  channelDimensionMatch,
];
