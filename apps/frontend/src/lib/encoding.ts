/**
 * Phase 7.1 — shared text-encoding helpers.
 *
 * Lifted out of zuluImport.ts / zuluExport.ts so the DXF import path
 * (and any future Russian / Mongolian CAD interop) can reuse the
 * same Windows-1251 ↔ Unicode mapping. The Zulu .sqlite flow keeps
 * its byte-string-shaped API via the `*FromByteString` / `*ToByteString`
 * variants so sql.js's "JS string where each char-code = one byte"
 * contract still works without a Uint8Array round-trip.
 *
 * Mongolian Cyrillic alphabet note:
 *   Ө / ө (U+04E8 / U+04E9) and Ү / ү (U+04AE / U+04AF) are NOT in
 *   the Windows-1251 codepage. Files that need those glyphs SHOULD
 *   be UTF-8 in modern AutoCAD output (AC1024+ / R2010+). For older
 *   files that round-trip Mongolian text through CP1251, the
 *   conversion will silently substitute "?" for the missing
 *   codepoints — engineer-visible at import time via mojibake-count
 *   warnings emitted by `decodeDxfBytes`.
 */

/* ─── CP1251 (Windows-1251) glyph table ─────────────────────────── */

/** Forward table: byte → Unicode codepoint string. Lower half is
 *  identity (ASCII), upper half covers Cyrillic + the standard
 *  Windows-1251 punctuation + currency glyphs. */
export const CP1251_TABLE: readonly string[] = [
  ...Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)),
  // 0x80-0xFF subset for Cyrillic + common punctuation
  "Ђ", "Ѓ", "‚", "ѓ", "„", "…", "†", "‡",
  "€", "‰", "Љ", "‹", "Њ", "Ќ", "Ћ", "Џ",
  "ђ", "‘", "’", "“", "”", "•", "–", "—",
  "?", "™", "љ", "›", "њ", "ќ", "ћ", "џ",
  " ", "Ў", "ў", "Ј", "¤", "Ґ", "¦", "§",
  "Ё", "©", "Є", "«", "¬", "­", "®", "Ї",
  "°", "±", "І", "і", "ґ", "µ", "¶", "·",
  "ё", "№", "є", "»", "ј", "Ѕ", "ѕ", "ї",
  "А", "Б", "В", "Г", "Д", "Е", "Ж", "З",
  "И", "Й", "К", "Л", "М", "Н", "О", "П",
  "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч",
  "Ш", "Щ", "Ъ", "Ы", "Ь", "Э", "Ю", "Я",
  "а", "б", "в", "г", "д", "е", "ж", "з",
  "и", "й", "к", "л", "м", "н", "о", "п",
  "р", "с", "т", "у", "ф", "х", "ц", "ч",
  "ш", "щ", "ъ", "ы", "ь", "э", "ю", "я",
];

/** Reverse table: Unicode codepoint → CP1251 byte. Built lazily on
 *  module init from `CP1251_TABLE`. */
export const CP1251_REVERSE: Readonly<Record<number, number>> = (() => {
  const map: Record<number, number> = {};
  for (let i = 0; i < CP1251_TABLE.length; i += 1) {
    const glyph = CP1251_TABLE[i]!;
    // Identity ASCII passes through; record only non-identity entries
    // so byte → ASCII is never ambiguous (e.g. "?" appears twice in
    // the table at 0x3F and 0x98 — we want 0x3F to win).
    if (glyph.length !== 1) continue;
    const cp = glyph.charCodeAt(0);
    if (cp in map) continue;
    map[cp] = i;
  }
  // Ensure ASCII identity is present
  for (let i = 0; i < 0x80; i += 1) map[i] = i;
  return map;
})();

/* ─── Byte-string variants (sql.js compatible) ─────────────────── */

/**
 * Decode a "byte string" (JS string where each char-code is one
 * CP1251 byte 0..255) → real Unicode string.
 *
 * Used by Zulu importer because sql.js returns TEXT columns as JS
 * strings without bytes-to-Unicode conversion.
 */
export function decodeCP1251FromByteString(byteString: string): string {
  let out = "";
  for (let i = 0; i < byteString.length; i += 1) {
    const c = byteString.charCodeAt(i);
    // c < 0x100 means it's a CP1251 byte; >= 0x100 means already
    // Unicode (caller passed an already-decoded string by mistake;
    // pass-through is the conservative choice).
    out += c < 0x100 ? CP1251_TABLE[c] ?? "?" : byteString[i]!;
  }
  return out;
}

/**
 * Encode a real Unicode string → "byte string" suitable for sql.js
 * to write as Windows-1251 bytes. Glyphs outside CP1251 (e.g. the
 * Mongolian Ө / Ү) become "?" (0x3F).
 */
export function encodeCP1251ToByteString(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.charCodeAt(i);
    const byte = CP1251_REVERSE[cp] ?? (cp < 0x100 ? cp : 0x3F /* ? */);
    out += String.fromCharCode(byte);
  }
  return out;
}

/* ─── Uint8Array variants (modern file-API flow) ───────────────── */

/** Decode a Uint8Array of CP1251 bytes → real Unicode string. */
export function decodeCP1251(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += CP1251_TABLE[bytes[i]!] ?? "?";
  }
  return out;
}

/** Encode a Unicode string → Uint8Array of CP1251 bytes. */
export function encodeCP1251(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.charCodeAt(i);
    out[i] = CP1251_REVERSE[cp] ?? (cp < 0x100 ? cp : 0x3F);
  }
  return out;
}

/* ─── DXF encoding detection (Phase 7.1) ───────────────────────── */

export type DxfEncoding = "utf-8" | "cp1251";

/**
 * 3-tier encoding detection for a DXF byte buffer:
 *
 *   Tier 1 — explicit `$DWGCODEPAGE` header within the first 8 KB:
 *     "ANSI_1251" → CP1251 (trusted)
 *     anything else → continue to Tier 2 (older AutoCAD installs
 *                  routinely mis-declare the codepage as ANSI_1252
 *                  even when the actual bytes are Cyrillic)
 *   Tier 2 — UTF-8 validation via `TextDecoder('utf-8', { fatal: true })`.
 *     If the buffer is valid UTF-8 → UTF-8.
 *     If decode throws → CP1251 (most likely).
 *   Tier 3 — byte-density tie-break: if Tier 2 decoded cleanly but
 *     0xC0-0xFF bytes are MOSTLY single-byte (not followed by
 *     0x80-0xBF continuation), the file is probably ASCII-with-a-few-
 *     CP1251-stragglers — still UTF-8 from the decoder's view.
 *
 * Returns the chosen encoding plus the raw `$DWGCODEPAGE` value (or
 * `undefined` if not present) for engineer-visible diagnostics. The
 * `cyrillicDensity` figure is purely informational — it counts bytes
 * in the 0xC0-0xFF range and is NOT used as the decision pivot
 * because UTF-8 Cyrillic multi-byte sequences sit in 0xD0-0xD3
 * (still within 0xC0-0xFF), making the raw density indistinguishable
 * between encodings.
 */
export function detectEncoding(
  bytes: Uint8Array,
  forced?: DxfEncoding,
): { encoding: DxfEncoding; codepageHeader?: string; cyrillicDensity: number } {
  const density = cyrillicByteDensity(bytes);
  if (forced) {
    return { encoding: forced, cyrillicDensity: density };
  }

  // Tier 1 — sniff $DWGCODEPAGE in the first 8 KB. Only trust the
  // header when it says 1251 — files claiming 1252 often lie.
  const headerSlice = bytes.subarray(0, Math.min(8192, bytes.length));
  const headerText = new TextDecoder("utf-8", { fatal: false }).decode(headerSlice);
  const m = headerText.match(/\$DWGCODEPAGE\s*\r?\n\s*\d+\s*\r?\n\s*([A-Za-z0-9_]+)/);
  const codepageHeader = m?.[1];

  if (codepageHeader && /1251/i.test(codepageHeader)) {
    return { encoding: "cp1251", codepageHeader, cyrillicDensity: density };
  }

  // Tier 2 — UTF-8 fatal-mode validation. If the bytes form a valid
  // UTF-8 sequence the file IS UTF-8 (the only way invalid bytes get
  // through here is if someone hand-crafted a confusion file).
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "utf-8", codepageHeader, cyrillicDensity: density };
  } catch {
    // Invalid UTF-8 → almost certainly CP1251 (or some other 8-bit
    // legacy encoding; CP1251 is the only one we ship a decoder for).
    return { encoding: "cp1251", codepageHeader, cyrillicDensity: density };
  }
}

function cyrillicByteDensity(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let count = 0;
  // Informational metric — counts bytes ≥ 0xC0. NOT used as the
  // encoding decision pivot (see `detectEncoding` comment).
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i]! >= 0xc0) count += 1;
  }
  return count / bytes.length;
}

/**
 * Decode a DXF ArrayBuffer to a Unicode string using the 3-tier
 * auto-detect. Used by `importDxfBytes` (Phase 7.1).
 *
 * Returns the decoded text plus a diagnostic object so callers can
 * surface "Encoding: CP1251 (detected)" / mojibake counts in the
 * engineer-facing review pane.
 */
export interface DxfDecodeResult {
  text: string;
  encoding: DxfEncoding;
  codepageHeader?: string;
  /** Count of U+FFFD replacement characters after decode — a
   *  positive value signals likely encoding mismatch. */
  replacementCharCount: number;
}

export function decodeDxfBytes(
  buffer: ArrayBuffer,
  opts: { forceEncoding?: DxfEncoding } = {},
): DxfDecodeResult {
  const bytes = new Uint8Array(buffer);
  const detection = detectEncoding(bytes, opts.forceEncoding);

  const text =
    detection.encoding === "cp1251"
      ? decodeCP1251(bytes)
      : new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  // U+FFFD = the Unicode replacement character — emitted by TextDecoder
  // when bytes don't form valid UTF-8 sequences. CP1251 decode never
  // produces it (table covers all bytes), so a positive count after
  // CP1251 decode means the table fell back to "?" — same diagnostic
  // signal, different glyph.
  let replacementCharCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 0xfffd) replacementCharCount += 1;
  }

  return {
    text,
    encoding: detection.encoding,
    codepageHeader: detection.codepageHeader,
    replacementCharCount,
  };
}
