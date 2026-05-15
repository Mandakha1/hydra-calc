/**
 * Phase 11.5 — First-time engineer onboarding tour.
 *
 * Lightweight 5-step modal carousel that appears once per user
 * on the first /app/new page visit. Engineer can dismiss at any
 * step; "Don't show again" preference persists to localStorage.
 *
 * NOT a tooltip-overlay tour (those require absolute-positioned
 * highlights, scroll coordination, etc. — over-engineered for the
 * pre-launch budget). Instead: 5 numbered card screens with key
 * features called out. Engineer reads in ~30 seconds.
 *
 * Tour content (Mongolian — target audience):
 *   1. Plan view + node placement
 *   2. DXF / Zulu import
 *   3. ⚙ Тооцоолох (calc)
 *   4. 📋 Стандарт (compliance check)
 *   5. 📚 Drawing Set PDF
 */
import { useState, type CSSProperties } from "react";

const STORAGE_KEY = "hydra:onboarding-seen-v1";

interface Step {
  title: string;
  body: string;
  emoji: string;
}

const STEPS: Step[] = [
  {
    emoji: "📐",
    title: "Хүндэлсэн инженер, тавтай морилно уу",
    body:
      "Hydra Calc нь Монголын дулаан хангамжийн сүлжээний гидравлик тооцооны SaaS. " +
      "Plan таб дээр зангилаа (ЦТП / АОС / худаг / насос) нэмж, хоолой холбож сүлжээгээ зурна уу.",
  },
  {
    emoji: "📂",
    title: "DXF / Zulu файл импорт",
    body:
      "Одоо ажиллаж буй AutoCAD .dxf эсвэл Zulu .sqlite файлаа импортолох боломжтой. " +
      "Импортын review pane дээр блокын нэр + давхаргын чиглэлийг шалгаад батална уу.",
  },
  {
    emoji: "⚙",
    title: "Тооцоолох — Darcy-Weisbach + Hardy-Cross",
    body:
      "⚙ Тооцоолох товч дарж сүлжээгээ гидравлик тооцоолно. Үр дүн / Пьезометр / " +
      "Тэнцвэржүүлэлт табд утга бүхэн харагдана. БНбД 41-01-2019 / СП 124.13330.2012 стандарт.",
  },
  {
    emoji: "📋",
    title: "Стандарт шалгалт — 30 БНбД дүрэм",
    body:
      "📋 Стандарт таб дээр сүлжээгээ 30 дүрмээр автомат шалгуулна — хурд / даралт / " +
      "температур / геометр. Зөрчилүүд категорчилогдон харагдана. Checker + approver " +
      "хүлээж авах баталгааны мөр.",
  },
  {
    emoji: "📚",
    title: "Drawing Set — 7-хуудастай PDF",
    body:
      "📚 Drawing Set товч → План + Профиль + Энерги + Худаг + Компенсатор + P&ID + " +
      "Compliance Report — нэг олон-хуудастай PDF. Хүлээн зөвшөөрөгдсөн зураг гарна. " +
      "Эхэлцгээе!",
  },
];

interface Props {
  onClose: () => void;
}

/** Check whether the tour should auto-show for this engineer. */
export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== "1";
}

/** Mark the tour as seen — engineer won't get it again unless they
 *  clear localStorage. Exposed for testing. */
export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
}

export function OnboardingTour({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const totalSteps = STEPS.length;
  const current = STEPS[step]!;

  function finish() {
    markOnboardingSeen();
    onClose();
  }

  function next() {
    if (step < totalSteps - 1) setStep(step + 1);
    else finish();
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <div style={overlayStyle} data-testid="onboarding-overlay">
      <div style={modalStyle} data-testid="onboarding-modal">
        <header style={headerStyle}>
          <span style={{ fontSize: 28 }}>{current.emoji}</span>
          <span style={{ fontSize: 11, color: "var(--fg-muted, #888)" }}>
            {step + 1} / {totalSteps}
          </span>
        </header>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }} data-testid="onboarding-title">
          {current.title}
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }} data-testid="onboarding-body">
          {current.body}
        </p>
        <footer style={footerStyle}>
          <button type="button" onClick={finish} style={skipBtn} data-testid="onboarding-skip">
            Алгасах
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button type="button" onClick={prev} style={secondaryBtn} data-testid="onboarding-prev">
                ← Өмнө
              </button>
            )}
            <button type="button" onClick={next} style={primaryBtn} data-testid="onboarding-next">
              {step === totalSteps - 1 ? "Эхлэх ✓" : "Дараах →"}
            </button>
          </div>
        </footer>
        {/* Progress dots */}
        <div style={dotsRow}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                ...dotStyle,
                background: i === step ? "var(--accent, #1f5faa)" : "var(--border-soft, #ddd)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: "1rem",
};

const modalStyle: CSSProperties = {
  background: "var(--bg, white)",
  borderRadius: 12,
  width: "min(520px, 96vw)",
  padding: 24,
  boxShadow: "0 20px 80px rgba(0,0,0,0.4)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 24,
};

const primaryBtn: CSSProperties = {
  padding: "8px 16px",
  background: "var(--accent, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const secondaryBtn: CSSProperties = {
  padding: "8px 16px",
  background: "var(--bg-elev, #f6f6f8)",
  border: "1px solid var(--border-soft, #ddd)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};

const skipBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--fg-muted, #888)",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
};

const dotsRow: CSSProperties = {
  display: "flex",
  gap: 6,
  justifyContent: "center",
  marginTop: 14,
};

const dotStyle: CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: "50%",
  transition: "background 0.2s",
};
