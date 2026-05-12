/**
 * Integration tests — require a live PostgreSQL (see docker-compose).
 * Run with: pnpm --filter backend test
 * Set DATABASE_URL to a throwaway test DB before running.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import { buildApp } from "../server.js";

// Test-only loose typing — Fastify's builder returns a highly parameterized type
// that doesn't round-trip cleanly with vitest/supertest generics. Runtime works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  request = supertest(app.server);
});

afterAll(async () => {
  await app.close();
});

describe("/api/health", () => {
  it("returns db:up", async () => {
    const res = await request.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("/api/auth happy path", () => {
  const email = `test_${Date.now()}@example.com`;
  const password = "hydra-test-1234";
  let token: string;

  it("register creates a new account", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ email, password, name: "Test" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.accessToken).toBeTruthy();
    token = res.body.accessToken;
  });

  it("rejects duplicate email", async () => {
    const res = await request
      .post("/api/auth/register")
      .send({ email, password });
    expect(res.status).toBe(409);
  });

  it("login returns fresh tokens", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects wrong password", async () => {
    const res = await request
      .post("/api/auth/login")
      .send({ email, password: "nope" });
    expect(res.status).toBe(401);
  });

  it("/me requires auth", async () => {
    const res = await request.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("/me returns current user with token", async () => {
    const res = await request.get("/api/auth/me").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

describe("/api/projects CRUD", () => {
  const email = `proj_${Date.now()}@example.com`;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    const reg = await request
      .post("/api/auth/register")
      .send({ email, password: "proj-test-1234" });
    token = reg.body.accessToken;
  });

  it("creates a project", async () => {
    const res = await request
      .post("/api/projects")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Test Project", data: { nodes: [], pipes: [] } });
    expect(res.status).toBe(201);
    projectId = res.body.id;
  });

  it("lists projects", async () => {
    const res = await request
      .get("/api/projects")
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("gets one with data", async () => {
    const res = await request
      .get(`/api/projects/${projectId}`)
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("updates", async () => {
    const res = await request
      .put(`/api/projects/${projectId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Renamed", data: { nodes: [{ id: "x" }] } });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("shares + public fetch works", async () => {
    const r1 = await request
      .post(`/api/projects/${projectId}/share`)
      .set("authorization", `Bearer ${token}`)
      .send({ canEdit: false });
    expect(r1.status).toBe(200);
    const token2 = r1.body.token;

    const r2 = await request.get(`/api/shared/${token2}`);
    expect(r2.status).toBe(200);
    expect(r2.body.readOnly).toBe(true);
  });

  it("deletes", async () => {
    const res = await request
      .delete(`/api/projects/${projectId}`)
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
