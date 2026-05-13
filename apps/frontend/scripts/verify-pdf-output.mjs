// Phase 6.7.4 automated verification.
//
// Reproduces the critical "PDF generation with Mongolian glyph
// embed" path that the engineer-facing 🖨 PDF button triggers:
//   1. Real Roboto-Cyrillic TTF is loaded from the lazy-chunk asset.
//   2. jsPDF embeds it via addFileToVFS + addFont + setFont.
//   3. pdf.text() writes the exact Mongolian strings the title-block
//      / annotation / scale-bar / standards-footer renderer would.
//   4. The PDF Blob is extracted to text via pdf-parse.
//   5. Expected strings are asserted; mojibake characters fail-flagged.
//
// This script focuses on the FONT-EMBED correctness — the single
// failure mode the manual checklist flagged as critical ("Mongolian
// 'Ө' / 'Ү' glyphs render correctly"). Full UI-driven e2e (start dev
// server + Playwright click → download) is out of scope here; the
// font-embed risk is what we can't easily verify in vitest.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { jsPDF } from "jspdf";
import { PDFParse } from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FONT_PATH = path.join(
  PROJECT_ROOT,
  "src/components/hydraulic/export/fonts/Roboto-Cyrillic.ttf",
);
const ARTIFACT_DIR = path.join(PROJECT_ROOT, "test-artifacts");

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

// Strings the manual checklist requires to round-trip correctly.
// Each maps to a real engineering field on the title block, scale
// bar, or an annotation.
const REQUIRED_STRINGS = [
  { label: "Engineer (Ө glyph)", value: "Б. Өлзий" },
  { label: "Checker (Ү glyph)", value: "С. Үнэн" },
  { label: "Approver", value: "Д. Дэлгэр" },
  { label: "Company (Cyrillic mix)", value: "Жишээ Дулаан ХХК" },
  { label: "Address", value: "Улаанбаатар, СБД-3" },
  { label: "Annotation (Ө + ё-style)", value: "Зөв ажиллаж байна" },
  { label: "Scale value", value: "1:500" },
  { label: "Standards footer", value: "БНбД 41-01-2019" },
  // Latin sanity check — confirms ASCII still works alongside Cyrillic
  { label: "Project code", value: "TS-2026-014" },
];

// Strings that must NOT appear — verifies the printVisible:false
// flag would exclude these. Since this script doesn't drive the SVG
// pipeline, we don't actually write these to the PDF — but checking
// they're absent validates pdf-parse isn't hallucinating.
const FORBIDDEN_STRINGS = ["construction-line-c1", "HIDDEN_LAYER_TEXT"];

// Substitution glyphs that signal mojibake / failed font embed.
// PDF readers commonly substitute missing glyphs with one of these.
const MOJIBAKE_GLYPHS = ["□", "?​", "�"];

function buildVerificationPdf() {
  const fontBytes = readFileSync(FONT_PATH);
  const fontBase64 = fontBytes.toString("base64");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a3",
  });

  // Mirror the exact font-embed path from pdfExport.ts loadFontIntoPdf.
  pdf.addFileToVFS("Roboto-Cyrillic.ttf", fontBase64);
  pdf.addFont("Roboto-Cyrillic.ttf", "RobotoCyr", "normal");
  pdf.setFont("RobotoCyr");

  // Mirror the title-block + scale-bar + annotation render paths
  // from pdfExport.ts. Each pdf.text() call is exactly what the
  // engineer-facing PDF would emit for the test fixture.
  pdf.setFontSize(10);
  let y = 20;
  const step = 8;
  pdf.text("Зургийн нэр: Дулааны магистрал шугам — план", 15, y); y += step;
  pdf.text("Төслийн код: TS-2026-014", 15, y); y += step;
  pdf.text("Хэмжээ: 1:500", 15, y); y += step;
  pdf.text("Огноо: 2026-05-13", 15, y); y += step;
  pdf.text("Зурсан: Б. Өлзий", 15, y); y += step;
  pdf.text("Шалгасан: С. Үнэн", 15, y); y += step;
  pdf.text("Бат. зөвш.: Д. Дэлгэр", 15, y); y += step;
  pdf.text("Фирм: Жишээ Дулаан ХХК", 15, y); y += step;
  pdf.text("Хаяг: Улаанбаатар, СБД-3", 15, y); y += step;
  pdf.text("Стандарт: БНбД 41-01-2019 / СП 124.13330.2012", 15, y); y += step;
  pdf.text("Тэмдэглэгээ: Зөв ажиллаж байна", 15, y); y += step;
  pdf.text("Хойт сум: Н — 0°", 15, y);

  return Buffer.from(pdf.output("arraybuffer"));
}

function findMojibake(text) {
  const found = [];
  for (const g of MOJIBAKE_GLYPHS) {
    if (text.includes(g)) found.push(g);
  }
  // U+003F ? is too common — only flag if appears in suspiciously
  // long runs (e.g. "????" suggests systematic glyph substitution).
  const longQuestionRun = text.match(/\?{3,}/);
  if (longQuestionRun) found.push(`long-? run: "${longQuestionRun[0]}"`);
  return found;
}

async function main() {
  console.log(`${YELLOW}Phase 6.7.4 automated PDF verification${RESET}\n`);

  // Step 1: build the PDF
  let pdfBuffer;
  try {
    pdfBuffer = buildVerificationPdf();
  } catch (e) {
    console.error(`${RED}❌ PDF generation failed:${RESET}`, e.message);
    process.exit(2);
  }
  const pdfSize = pdfBuffer.length;
  console.log(`✓ PDF generated (${pdfSize} bytes)`);

  if (pdfSize < 5_000) {
    // Sanity check only — even a font-subsetted PDF with the title
    // block lines we write is comfortably > 10 KB. Below 5 KB
    // suggests jsPDF errored silently.
    console.error(`${RED}❌ PDF size ${pdfSize} bytes — generation likely failed${RESET}`);
    process.exit(2);
  }

  // Step 2: extract text
  let extracted;
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    extracted = await parser.getText();
  } catch (e) {
    console.error(`${RED}❌ pdf-parse text extraction failed:${RESET}`, e.message);
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const stampPath = path.join(ARTIFACT_DIR, `verify-extract-fail-${Date.now()}.pdf`);
    writeFileSync(stampPath, pdfBuffer);
    console.error(`  Saved failing PDF to ${stampPath}`);
    process.exit(3);
  }

  const text = extracted?.text ?? "";
  console.log(`✓ pdf-parse extracted ${text.length} chars of text\n`);
  console.log(`${YELLOW}-- Extracted text begin --${RESET}`);
  console.log(text.slice(0, 600));
  console.log(`${YELLOW}-- Extracted text end --${RESET}\n`);

  // Step 3: assert required Mongolian + Latin strings
  const missing = REQUIRED_STRINGS.filter((s) => !text.includes(s.value));
  for (const s of REQUIRED_STRINGS) {
    if (text.includes(s.value)) {
      console.log(`${GREEN}  ✓${RESET} ${s.label} — "${s.value}"`);
    } else {
      console.log(`${RED}  ✗${RESET} ${s.label} — "${s.value}"`);
    }
  }
  console.log();

  // Step 4: assert no forbidden strings
  const leaks = FORBIDDEN_STRINGS.filter((s) => text.includes(s));

  // Step 5: assert no mojibake
  const mojibake = findMojibake(text);

  // Final verdict
  const failures = [];
  if (missing.length > 0)
    failures.push(`${missing.length} required string(s) missing: ${missing.map((m) => m.value).join(", ")}`);
  if (leaks.length > 0)
    failures.push(`Forbidden string(s) found: ${leaks.join(", ")}`);
  if (mojibake.length > 0)
    failures.push(`Mojibake / substitution glyphs detected: ${mojibake.join(", ")}`);

  if (failures.length === 0) {
    console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${GREEN}✓ ALL CHECKS PASS — Mongolian glyphs round-trip correctly${RESET}`);
    console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    process.exit(0);
  }

  // FAIL path
  console.error(`${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.error(`${RED}❌ VERIFICATION FAILED${RESET}`);
  for (const f of failures) {
    console.error(`${RED}  • ${f}${RESET}`);
  }
  console.error(`${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifactPath = path.join(ARTIFACT_DIR, `verify-fail-${Date.now()}.pdf`);
  writeFileSync(artifactPath, pdfBuffer);
  console.error(`\n  Saved failing PDF to ${artifactPath}`);
  console.error(`  Inspect with any PDF reader to diagnose root cause.`);

  process.exit(1);
}

main().catch((e) => {
  console.error(`${RED}Unexpected error:${RESET}`, e);
  process.exit(4);
});
