import { z } from "zod";
import {
  PROJECT_NAME_MAX,
  PROJECT_DESCRIPTION_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from "./constants.js";

export const emailSchema = z.string().email().max(255).toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, { message: `Нууц үг хамгийн багадаа ${PASSWORD_MIN} тэмдэгт байна` })
  .max(PASSWORD_MAX);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const projectCreateSchema = z.object({
  name: z.string().min(1).max(PROJECT_NAME_MAX),
  description: z.string().max(PROJECT_DESCRIPTION_MAX).nullish(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  data: z.record(z.unknown()),
});

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  isPublic: z.boolean().optional(),
});

export const shareCreateSchema = z.object({
  canEdit: z.boolean().default(false),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 365).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
