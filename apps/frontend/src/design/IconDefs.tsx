/**
 * SVG icon symbol library for Hydra Calc design.
 * Mount once at app root; design components use <use href="#ic-..."/> to reference.
 */
export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="ic-grid" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12" />
        </symbol>
        <symbol id="ic-pump" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M8 3v10M3 8h10" />
        </symbol>
        <symbol id="ic-pipe" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M2 8h12M5 5v6M11 5v6" />
        </symbol>
        <symbol id="ic-valve" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M2 4l5 4-5 4zM14 4l-5 4 5 4zM7 8h2" />
        </symbol>
        <symbol id="ic-house" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M2 7l6-4 6 4v7H2zM6 14V9h4v5" />
        </symbol>
        <symbol id="ic-source" viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M5 8c1-2 2-2 3 0s2 2 3 0" />
        </symbol>
        <symbol id="ic-bend" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M2 14V8a4 4 0 0 1 4-4h8" />
        </symbol>
        <symbol id="ic-tee" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M2 8h12M8 8v6" />
        </symbol>
        <symbol id="ic-cursor" viewBox="0 0 16 16">
          <path fill="currentColor" d="M3 2l8 4-3.5 1L9 13l-2 1-1.5-5L3 11z" />
        </symbol>
        <symbol id="ic-pan" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M8 2v6M2 8h6M8 14V8M14 8H8" />
        </symbol>
        <symbol id="ic-zoomin" viewBox="0 0 16 16">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path stroke="currentColor" strokeWidth="1.3" d="M11 11l3 3M5 7h4M7 5v4" />
        </symbol>
        <symbol id="ic-play" viewBox="0 0 16 16">
          <path fill="currentColor" d="M4 3l9 5-9 5z" />
        </symbol>
        <symbol id="ic-share" viewBox="0 0 16 16">
          <circle cx="4" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path stroke="currentColor" strokeWidth="1.3" d="M5.5 7l5-2.5M5.5 9l5 2.5" />
        </symbol>
        <symbol id="ic-export" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3" />
        </symbol>
        <symbol id="ic-check" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M3 8l3 3 7-7" />
        </symbol>
        <symbol id="ic-cross" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M3 3l10 10M13 3L3 13" />
        </symbol>
        <symbol id="ic-warn" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M8 2l6 11H2zM8 6v4M8 11.5v.5" />
        </symbol>
        <symbol id="ic-search" viewBox="0 0 16 16">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path stroke="currentColor" strokeWidth="1.3" d="M11 11l3 3" />
        </symbol>
        <symbol id="ic-layers" viewBox="0 0 16 16">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M2 5l6-3 6 3-6 3zM2 8l6 3 6-3M2 11l6 3 6-3" />
        </symbol>
        <symbol id="ic-info" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path stroke="currentColor" strokeWidth="1.3" d="M8 7v4M8 5v.5" />
        </symbol>
      </defs>
    </svg>
  );
}
