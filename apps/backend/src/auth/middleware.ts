import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken, type JwtPayload } from "./jwt.js";
import { errors } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw errors.unauthorized();
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
  } catch {
    throw errors.unauthorized("Токен хүчингүй эсвэл хугацаа нь дууссан");
  }
}

export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply) {
  await requireAuth(req, _reply);
  if (req.user?.role !== "admin") throw errors.forbidden("Зөвхөн админ хандана");
}

export async function optionalAuth(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // silent — treat as anonymous
    }
  }
}
