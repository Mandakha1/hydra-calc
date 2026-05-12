export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  unauthorized: (msg = "Нэвтрэх шаардлагатай") => new ApiError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "Хандах эрхгүй") => new ApiError(403, "FORBIDDEN", msg),
  notFound: (msg = "Олдсонгүй") => new ApiError(404, "NOT_FOUND", msg),
  conflict: (msg: string) => new ApiError(409, "CONFLICT", msg),
  badRequest: (msg: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", msg, details),
  validation: (details: unknown) => new ApiError(422, "VALIDATION_ERROR", "Оролт зөв биш", details),
  rateLimited: (msg = "Хэтэрхий олон хүсэлт") => new ApiError(429, "RATE_LIMITED", msg),
  internal: (msg = "Серверийн алдаа") => new ApiError(500, "INTERNAL", msg),
};
