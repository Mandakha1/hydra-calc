// Compliance labels — UI-д харагдаж байх ёстой (compliance, not branding).
export const STANDARDS = {
  MNS_4217: "МНС 4217",
  BNBD_41_01: "БНбД 41-01-2019",
  BNBD_23_02: "БНбД 23-02-09",
} as const;

export const APP_NAME = "Hydra Calc";
export const APP_TAGLINE = "Дулаан хангамжийн сүлжээний гидравлик тооцоолуур";

// Hydraulic engineering constants placeholder.
// In Faza 4 we import the real WATER_PROPS / PIPE_DB / PIPE_FITTINGS / WELL_EQUIPMENT /
// WALL_TYPES tables from hydraulic-v5.jsx *unchanged* (single source of truth).
export const HYDRAULIC_SCHEMA_VERSION = 5 as const;

// Schema validation defaults.
export const PROJECT_NAME_MAX = 200;
export const PROJECT_DESCRIPTION_MAX = 2000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Rate limit buckets — match routes table in spec.
export const RATE_LIMITS = {
  register: { max: 3, timeWindow: "1 minute" },
  login: { max: 5, timeWindow: "1 minute" },
  refresh: { max: 10, timeWindow: "1 minute" },
  projectsList: { max: 60, timeWindow: "1 minute" },
  projectsWrite: { max: 30, timeWindow: "1 minute" },
  share: { max: 10, timeWindow: "1 minute" },
  sharedView: { max: 30, timeWindow: "1 minute" },
  global: { max: 100, timeWindow: "1 minute" },
} as const;
