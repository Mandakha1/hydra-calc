/**
 * Phase 7.1 — encoding pipeline tests.
 *
 * Covers the CP1251 ↔ Unicode round-trip + the DXF `$DWGCODEPAGE`
 * detection + the importDxfBytes end-to-end on the synthetic fixture.
 *
 * Backward-compat regression check: zulu importer's existing byte-
 * string path must still work after the codec was lifted into the
 * shared module.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CP1251_TABLE,
  CP1251_REVERSE,
  decodeCP1251,
  encodeCP1251,
  decodeCP1251FromByteString,
  encodeCP1251ToByteString,
  detectEncoding,
  decodeDxfBytes,
} from "../encoding";
import { importDxfBytes } from "../dxfImport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, "fixtures", "synthetic-heating.dxf");

/* ─── CP1251 round-trip ─────────────────────────────────────────── */

describe("CP1251 codec — Phase 7.1", () => {
  it("table covers 256 entries", () => {
    expect(CP1251_TABLE).toHaveLength(256);
  });

  it("ASCII identity passes through both directions", () => {
    const ascii = "Hello 123";
    const bytes = encodeCP1251(ascii);
    expect(bytes).toEqual(new Uint8Array([72, 101, 108, 108, 111, 32, 49, 50, 51]));
    expect(decodeCP1251(bytes)).toBe(ascii);
  });

  it("round-trips standard Russian Cyrillic", () => {
    const russian = "Хүйтэн ус"; // mixes Mongolian Ү (U+04AE) — should round-trip via CP1251 question mark for Ү
    // CP1251 doesn't include U+04AE so the round-trip lossily replaces it with "?".
    // Test the standard-Russian-only round-trip separately:
    const ru = "Привет мир";
    const ruBytes = encodeCP1251(ru);
    expect(decodeCP1251(ruBytes)).toBe(ru);
    // Test the lossy Mongolian path:
    const decoded = decodeCP1251(encodeCP1251(russian));
    expect(decoded).toContain("?"); // Mongolian Ү lost to ? in CP1251
    expect(decoded).toContain("Х"); // Standard Cyrillic preserved
  });

  it("CP1251_REVERSE inverts the forward table for Cyrillic block", () => {
    // 0xC0 = "А" (U+0410)
    expect(CP1251_REVERSE[0x0410]).toBe(0xc0);
    // 0xE0 = "а" (U+0430)
    expect(CP1251_REVERSE[0x0430]).toBe(0xe0);
    // 0xA8 = "Ё" (U+0401)
    expect(CP1251_REVERSE[0x0401]).toBe(0xa8);
  });

  it("byte-string variants match the Uint8Array variants for Cyrillic", () => {
    const text = "Магистрал";
    const bs = encodeCP1251ToByteString(text);
    const u8 = encodeCP1251(text);
    // bs is JS string where each char-code = one CP1251 byte; u8 is
    // the same bytes in a Uint8Array.
    expect(bs).toHaveLength(u8.length);
    for (let i = 0; i < u8.length; i += 1) {
      expect(bs.charCodeAt(i)).toBe(u8[i]);
    }
    // Round-trip both APIs
    expect(decodeCP1251(u8)).toBe(text);
    expect(decodeCP1251FromByteString(bs)).toBe(text);
  });
});

/* ─── Encoding detection ───────────────────────────────────────── */

describe("detectEncoding — Phase 7.1", () => {
  it("trusts $DWGCODEPAGE=ANSI_1251", () => {
    const buf = textToBytes(
      "  9\n$DWGCODEPAGE\n  3\nANSI_1251\n  0\nENDSEC\n",
    );
    const r = detectEncoding(buf);
    expect(r.encoding).toBe("cp1251");
    expect(r.codepageHeader).toBe("ANSI_1251");
  });

  it("returns UTF-8 for valid UTF-8 file even when $DWGCODEPAGE=ANSI_1252", () => {
    const buf = textToBytes(
      "  9\n$DWGCODEPAGE\n  3\nANSI_1252\nДамжуулагч магистрал\n",
    );
    const r = detectEncoding(buf);
    expect(r.encoding).toBe("utf-8");
    expect(r.codepageHeader).toBe("ANSI_1252");
  });

  it("returns CP1251 for invalid UTF-8 with Cyrillic-range bytes", () => {
    // Construct a CP1251-encoded byte sequence that wouldn't be
    // valid UTF-8: a single 0xCF (Russian "П") followed by ASCII.
    const buf = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // "Привет" in CP1251
    const r = detectEncoding(buf);
    expect(r.encoding).toBe("cp1251");
  });

  it("returns UTF-8 for pure ASCII", () => {
    const buf = textToBytes("LINE\n  8\nHEATING\n");
    const r = detectEncoding(buf).encoding;
    expect(r).toBe("utf-8");
  });

  it("honours forced encoding override", () => {
    const buf = textToBytes("plain ascii");
    expect(detectEncoding(buf, "cp1251").encoding).toBe("cp1251");
    expect(detectEncoding(buf, "utf-8").encoding).toBe("utf-8");
  });
});

/* ─── decodeDxfBytes wrapper ───────────────────────────────────── */

describe("decodeDxfBytes — Phase 7.1", () => {
  it("decodes a UTF-8 buffer cleanly", () => {
    const text = "  0\nLINE\n  8\nДамжуулагч магистрал\n";
    const buf = new TextEncoder().encode(text);
    const r = decodeDxfBytes(buf.buffer);
    expect(r.encoding).toBe("utf-8");
    expect(r.text).toBe(text);
    expect(r.replacementCharCount).toBe(0);
  });

  it("decodes a CP1251 buffer via header sniff", () => {
    const header = "  9\n$DWGCODEPAGE\n  3\nANSI_1251\n";
    const cyrillicPayload = "ХАЛААЛТ"; // CP1251 only (all Cyrillic в C-range)
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(header),
      ...encodeCP1251(cyrillicPayload),
    ]);
    const r = decodeDxfBytes(bytes.buffer);
    expect(r.encoding).toBe("cp1251");
    expect(r.text).toContain("ХАЛААЛТ");
  });

  it("counts U+FFFD replacement characters as diagnostic signal", () => {
    // Construct invalid UTF-8 then force UTF-8 decode → fallback
    // replacement chars appear.
    const buf = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]); // invalid UTF-8
    const r = decodeDxfBytes(buf.buffer, { forceEncoding: "utf-8" });
    expect(r.replacementCharCount).toBeGreaterThan(0);
  });
});

/* ─── importDxfBytes end-to-end on synthetic fixture ───────────── */

describe("importDxfBytes — Phase 7.1 fixture", () => {
  it("parses synthetic-heating.dxf cleanly", async () => {
    const raw = readFileSync(FIXTURE_PATH);
    const result = await importDxfBytes(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect(result.stats.pipes).toBeGreaterThan(0);
    expect(result.stats.nodes).toBeGreaterThan(0);
  });

  it("preserves Cyrillic block name + text through the encoding pipeline (no mojibake)", () => {
    const raw = readFileSync(FIXTURE_PATH);
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    // The pipeline must round-trip both the block name and the TEXT
    // entity without mojibake. Phase 7.2 wires the classifier to
    // route АОС→consumer_apartment; for 7.1 we only verify the
    // bytes survive intact through the decoder.
    const decoded = decodeDxfBytes(buf);
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.replacementCharCount).toBe(0);
    expect(decoded.text).toContain("АОС-1");
    expect(decoded.text).toContain("Дамжуулагч магистрал");
  });

  it("exposes encodingDiagnostic on the result", async () => {
    const raw = readFileSync(FIXTURE_PATH);
    const result = await importDxfBytes(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect(result.encodingDiagnostic.encoding).toBe("utf-8");
    expect(result.encodingDiagnostic.replacementCharCount).toBe(0);
  });

  it("flags mojibake count in warnings when replacement chars appear", async () => {
    // Construct a minimal DXF-ish buffer with invalid UTF-8 in a
    // TEXT entity. Forces the diagnostic path.
    const dxf = [
      "  0", "SECTION", "  2", "HEADER",
      "  9", "$ACADVER", "  1", "AC1014",
      "  0", "ENDSEC",
      "  0", "SECTION", "  2", "ENTITIES",
      "  0", "LINE", "  8", "0",
      " 10", "0", " 20", "0", " 30", "0",
      " 11", "1", " 21", "0", " 31", "0",
      "  0", "ENDSEC",
      "  0", "EOF", "",
    ].join("\n");
    const valid = new TextEncoder().encode(dxf);
    // Splice a couple of invalid-UTF-8 bytes into the middle (within
    // the header area, won't break the parser).
    const corrupted = new Uint8Array(valid.length + 2);
    corrupted.set(valid.subarray(0, 40), 0);
    corrupted[40] = 0xff;
    corrupted[41] = 0xfe;
    corrupted.set(valid.subarray(40), 42);
    const result = await importDxfBytes(corrupted.buffer, { forceEncoding: "utf-8" });
    // Either the decoder flagged it via warnings, or the diagnostic
    // surfaces it.
    expect(
      result.warnings.some((w) => w.includes("Кодлогдол")) ||
        result.encodingDiagnostic.replacementCharCount > 0,
    ).toBe(true);
  });
});

/* ─── Zulu backward-compat smoke test ──────────────────────────── */

describe("Zulu byte-string path — backward-compat after codec lift", () => {
  it("decodeCP1251FromByteString still maps the canonical bytes", () => {
    // Build a JS byte-string of CP1251 bytes for "Магистрал" (10 chars).
    const bytes = encodeCP1251("Магистрал");
    let bs = "";
    for (let i = 0; i < bytes.length; i += 1) {
      bs += String.fromCharCode(bytes[i]!);
    }
    expect(decodeCP1251FromByteString(bs)).toBe("Магистрал");
  });

  it("encodeCP1251ToByteString round-trips Cyrillic", () => {
    const text = "Хоолой";
    const bs = encodeCP1251ToByteString(text);
    expect(decodeCP1251FromByteString(bs)).toBe(text);
  });

  it("byte-string vs Uint8Array variants agree on a Cyrillic-only string", () => {
    const text = "БНбД";
    const u8 = encodeCP1251(text);
    const bs = encodeCP1251ToByteString(text);
    expect(bs).toHaveLength(u8.length);
    for (let i = 0; i < u8.length; i += 1) {
      expect(bs.charCodeAt(i)).toBe(u8[i]!);
    }
  });
});

/* ─── Helpers ──────────────────────────────────────────────────── */

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
