// Core domain types shared by backend + frontend.
// Expanded in Faza 1 (DB models) and Faza 4 (HydraulicState).

export type UserRole = "user" | "admin";

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  verified: boolean;
  createdAt: string; // ISO
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  isPublic: boolean;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFull extends ProjectSummary {
  userId: string;
  data: HydraulicState;
}

// Placeholder — narrowed in Faza 4 when we port hydraulic-v5.jsx.
// Kept loose to avoid premature coupling.
export interface HydraulicState {
  nodes?: unknown[];
  pipes?: unknown[];
  sp?: Record<string, unknown>;
  results?: unknown;
  [key: string]: unknown;
}

export interface AuthTokens {
  accessToken: string;
  accessExpiresAt: number; // epoch ms
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}
