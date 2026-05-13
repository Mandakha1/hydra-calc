/**
 * Phase 6.7.2 — Title-block tests.
 *
 * Pure-function coverage for defaults / dimensions / row layout +
 * store integration (settings persistence, the live `printScale`
 * → title-block "Хэмжээ" row binding).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_DRAWING_TITLE,
  DEFAULT_STANDARDS_FOOTER,
  DEFAULT_REVISION,
  DEFAULT_SHEET_NUMBER,
  todayIsoDate,
  applyTitleBlockDefaults,
  titleBlockDimensionsMm,
  titleBlockRows,
  TITLE_BLOCK_PAPER_MARGIN_MM,
} from "../titleBlockMeta";
import { useHydraulicStore } from "../../hydraulicStore";
import type { TitleBlockMeta } from "../../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("todayIsoDate — Phase 6.7.2", () => {
  it("returns YYYY-MM-DD format with zero-padded month + day", () => {
    const s = todayIsoDate();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the current calendar date", () => {
    const d = new Date();
    const expected =
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, "0")}-` +
      `${String(d.getDate()).padStart(2, "0")}`;
    expect(todayIsoDate()).toBe(expected);
  });
});

describe("applyTitleBlockDefaults — Phase 6.7.2", () => {
  it("returns a fully-defaulted block when meta is undefined", () => {
    const d = applyTitleBlockDefaults(undefined);
    expect(d.drawingTitle).toBe(DEFAULT_DRAWING_TITLE);
    expect(d.revision).toBe(DEFAULT_REVISION);
    expect(d.sheetNumber).toBe(DEFAULT_SHEET_NUMBER);
    expect(d.standardsFooter).toBe(DEFAULT_STANDARDS_FOOTER);
    expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.engineer).toBe("");
    expect(d.checker).toBe("");
    expect(d.approver).toBe("");
    expect(d.company).toBe("");
    expect(d.address).toBe("");
    expect(d.projectCode).toBe("");
  });

  it("preserves engineer-supplied values over defaults", () => {
    const meta: TitleBlockMeta = {
      drawingTitle: "Дулааны түгээгүүр",
      engineer: "Б.Тэмүүжин",
      revision: "A",
    };
    const d = applyTitleBlockDefaults(meta);
    expect(d.drawingTitle).toBe("Дулааны түгээгүүр");
    expect(d.engineer).toBe("Б.Тэмүүжин");
    expect(d.revision).toBe("A");
    // Untouched fields still get defaults.
    expect(d.sheetNumber).toBe(DEFAULT_SHEET_NUMBER);
  });

  it("falls back to today when date is empty / blank", () => {
    expect(applyTitleBlockDefaults({ date: "" }).date).toBe(todayIsoDate());
    expect(applyTitleBlockDefaults({ date: "   " }).date).toBe(todayIsoDate());
  });

  it("standardsFooter is editable — engineer override survives default-applier", () => {
    const meta: TitleBlockMeta = {
      standardsFooter: "БНбД 41-01-2019 + ОВт MNS 4217",
    };
    expect(applyTitleBlockDefaults(meta).standardsFooter).toBe(
      "БНбД 41-01-2019 + ОВт MNS 4217",
    );
  });
});

describe("titleBlockDimensionsMm — Phase 6.7.2", () => {
  it("A3 landscape is 185 × 70 mm", () => {
    expect(titleBlockDimensionsMm("A3", "landscape")).toEqual({
      width: 185,
      height: 70,
    });
  });

  it("A3 portrait is 180 × 70 mm", () => {
    expect(titleBlockDimensionsMm("A3", "portrait")).toEqual({
      width: 180,
      height: 70,
    });
  });

  it("A4 (either orientation) is 165 × 55 mm", () => {
    expect(titleBlockDimensionsMm("A4", "portrait")).toEqual({
      width: 165,
      height: 55,
    });
    expect(titleBlockDimensionsMm("A4", "landscape")).toEqual({
      width: 165,
      height: 55,
    });
  });

  it("paper margin constant is 10 mm (drafting convention)", () => {
    expect(TITLE_BLOCK_PAPER_MARGIN_MM).toBe(10);
  });
});

describe("titleBlockRows — Phase 6.7.2", () => {
  it("returns exactly 12 rows in the documented order", () => {
    const rows = titleBlockRows(undefined, "1:500");
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.label)).toEqual([
      "Зургийн нэр",
      "Төслийн код",
      "Хэмжээ",
      "Огноо",
      "Зурсан",
      "Шалгасан",
      "Бат. зөвш.",
      "Фирм",
      "Хаяг",
      "Сэргээлт",
      "Хуудас",
      "Стандарт",
    ]);
  });

  it("signature flag is set only on Зурсан / Шалгасан / Бат. зөвш. rows", () => {
    const rows = titleBlockRows(undefined, "1:500");
    const sigLabels = rows.filter((r) => r.signature).map((r) => r.label);
    expect(sigLabels).toEqual(["Зурсан", "Шалгасан", "Бат. зөвш."]);
  });

  it("Хэмжээ row binds to the live `scale` argument, not stored meta", () => {
    expect(titleBlockRows(undefined, "1:200").find((r) => r.label === "Хэмжээ")!.value).toBe("1:200");
    expect(titleBlockRows(undefined, "1:2000").find((r) => r.label === "Хэмжээ")!.value).toBe("1:2000");
  });

  it("empty engineer-supplied fields render as blank value strings (rows survive)", () => {
    const rows = titleBlockRows({}, "1:500");
    // Зурсан / Шалгасан / Бат. зөвш. all blank but rows present so
    // signature boxes still render.
    expect(rows.find((r) => r.label === "Зурсан")!.value).toBe("");
    expect(rows.find((r) => r.label === "Шалгасан")!.value).toBe("");
    expect(rows.find((r) => r.label === "Бат. зөвш.")!.value).toBe("");
    // Standards footer falls back to default.
    expect(rows.find((r) => r.label === "Стандарт")!.value).toBe(DEFAULT_STANDARDS_FOOTER);
  });

  it("engineer values propagate verbatim into the row table", () => {
    const meta: TitleBlockMeta = {
      drawingTitle: "ИТП-1 — план",
      engineer: "Б.Тэмүүжин",
      checker: "Ц.Энхтайван",
      company: "Эрчим Дизайн ХХК",
      address: "СБД, Ялалт-12",
      projectCode: "TS-2026-014",
      revision: "B",
      sheetNumber: "2/4",
    };
    const rows = titleBlockRows(meta, "1:1000");
    expect(rows.find((r) => r.label === "Зургийн нэр")!.value).toBe("ИТП-1 — план");
    expect(rows.find((r) => r.label === "Зурсан")!.value).toBe("Б.Тэмүүжин");
    expect(rows.find((r) => r.label === "Шалгасан")!.value).toBe("Ц.Энхтайван");
    expect(rows.find((r) => r.label === "Фирм")!.value).toBe("Эрчим Дизайн ХХК");
    expect(rows.find((r) => r.label === "Хаяг")!.value).toBe("СБД, Ялалт-12");
    expect(rows.find((r) => r.label === "Төслийн код")!.value).toBe("TS-2026-014");
    expect(rows.find((r) => r.label === "Сэргээлт")!.value).toBe("B");
    expect(rows.find((r) => r.label === "Хуудас")!.value).toBe("2/4");
  });
});

describe("Store integration — Phase 6.7.2", () => {
  it("fresh project has no titleBlock set (defaults apply at render)", () => {
    expect(useHydraulicStore.getState().settings.titleBlock).toBeUndefined();
  });

  it("updateSettings persists titleBlock as a sparse sub-object", () => {
    useHydraulicStore.getState().updateSettings({
      titleBlock: {
        engineer: "Б.Тэмүүжин",
        date: "2026-05-13",
      },
    });
    const tb = useHydraulicStore.getState().settings.titleBlock!;
    expect(tb.engineer).toBe("Б.Тэмүүжин");
    expect(tb.date).toBe("2026-05-13");
    // Untouched fields stay undefined so the renderer's default
    // applier can fill them.
    expect(tb.drawingTitle).toBeUndefined();
    expect(tb.standardsFooter).toBeUndefined();
  });

  it("reset() clears titleBlock back to undefined", () => {
    useHydraulicStore.getState().updateSettings({
      titleBlock: { engineer: "Б.Тэмүүжин" },
    });
    expect(useHydraulicStore.getState().settings.titleBlock).toBeDefined();
    useHydraulicStore.getState().reset();
    expect(useHydraulicStore.getState().settings.titleBlock).toBeUndefined();
  });

  it("titleBlock survives a second updateSettings call (merge-via-spread)", () => {
    const u = useHydraulicStore.getState().updateSettings;
    const read = () => useHydraulicStore.getState().settings.titleBlock ?? {};
    // Step 1 — engineer fills two fields.
    u({ titleBlock: { ...read(), engineer: "A" } });
    u({ titleBlock: { ...read(), checker: "B" } });
    const tb = useHydraulicStore.getState().settings.titleBlock!;
    expect(tb.engineer).toBe("A");
    expect(tb.checker).toBe("B");
  });
});
