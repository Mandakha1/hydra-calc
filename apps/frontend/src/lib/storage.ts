/**
 * Drop-in replacement for the legacy `window.storage` API.
 * In demo mode, uses browser localStorage — no backend needed.
 * Otherwise calls the REST API.
 */
import { api, HttpError } from "./api";
import { useAuthStore } from "./authStore";

export interface StorageEntry {
  key: string;
  value: string;
  shared?: boolean;
}

interface ProjectListItem {
  id: string;
  name: string;
}
interface ListResponse {
  items: ProjectListItem[];
}
interface ProjectFullResponse {
  id: string;
  name: string;
  data: unknown;
}

const DEMO_LS_PREFIX = "hydra.demo.project:";

function stripPrefix(key: string): string {
  return key.startsWith("project:") ? key.slice("project:".length) : key;
}

function isDemo() {
  return useAuthStore.getState().demoMode;
}

async function findByName(name: string): Promise<ProjectListItem | null> {
  const res = await api.get<ListResponse>(`/projects?name=${encodeURIComponent(name)}`);
  return res.items[0] ?? null;
}

/* ------------------ demo (localStorage) backend ------------------ */
const lsStorage = {
  get(name: string): StorageEntry | null {
    const raw = window.localStorage.getItem(DEMO_LS_PREFIX + name);
    if (!raw) return null;
    return { key: `project:${name}`, value: raw, shared: false };
  },
  set(name: string, value: string): StorageEntry {
    window.localStorage.setItem(DEMO_LS_PREFIX + name, value);
    window.localStorage.setItem(DEMO_LS_PREFIX + name + ":ts", String(Date.now()));
    return { key: `project:${name}`, value, shared: false };
  },
  list(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(DEMO_LS_PREFIX) && !k.endsWith(":ts")) {
        keys.push(`project:${k.slice(DEMO_LS_PREFIX.length)}`);
      }
    }
    return keys;
  },
  delete(name: string) {
    window.localStorage.removeItem(DEMO_LS_PREFIX + name);
    window.localStorage.removeItem(DEMO_LS_PREFIX + name + ":ts");
  },
  timestamps(): Record<string, number> {
    const out: Record<string, number> = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(DEMO_LS_PREFIX) && k.endsWith(":ts")) {
        const name = k.slice(DEMO_LS_PREFIX.length, -3);
        out[name] = Number(window.localStorage.getItem(k) ?? 0);
      }
    }
    return out;
  },
};

export const storage = {
  async get(key: string): Promise<StorageEntry | null> {
    const name = stripPrefix(key);
    if (isDemo()) return lsStorage.get(name);

    try {
      const item = await findByName(name);
      if (!item) return null;
      const full = await api.get<ProjectFullResponse>(`/projects/${item.id}`);
      return { key, value: JSON.stringify(full.data), shared: false };
    } catch (err) {
      if (err instanceof HttpError && err.status >= 500) return lsStorage.get(name);
      throw err;
    }
  },

  async set(key: string, value: string): Promise<StorageEntry> {
    const name = stripPrefix(key);
    if (isDemo()) return lsStorage.set(name, value);

    const data = JSON.parse(value);
    const existing = await findByName(name);
    if (existing) {
      await api.put(`/projects/${existing.id}`, { name, data });
    } else {
      await api.post("/projects", { name, data });
    }
    return { key, value, shared: false };
  },

  async list(prefix: string): Promise<{ keys: string[]; prefix: string }> {
    if (prefix !== "project:") return { keys: [], prefix };
    if (isDemo()) return { keys: lsStorage.list(), prefix };

    const res = await api.get<ListResponse>("/projects?limit=200");
    return {
      keys: res.items.map((p) => `project:${p.name}`),
      prefix,
    };
  },

  async delete(key: string): Promise<{ key: string; deleted: boolean }> {
    const name = stripPrefix(key);
    if (isDemo()) {
      lsStorage.delete(name);
      return { key, deleted: true };
    }

    const existing = await findByName(name);
    if (!existing) return { key, deleted: false };
    await api.del(`/projects/${existing.id}`);
    return { key, deleted: true };
  },
};

export function installGlobalStorage() {
  if (typeof window !== "undefined") {
    (window as unknown as { storage: typeof storage }).storage = storage;
  }
}

/** Demo mode list helper for Dashboard. */
export function listDemoProjects(): Array<{ id: string; name: string; updatedAt: string }> {
  const timestamps = lsStorage.timestamps();
  return lsStorage.list().map((k) => {
    const name = k.slice("project:".length);
    const ts = timestamps[name] ?? Date.now();
    return {
      id: name, // name serves as ID in demo
      name,
      updatedAt: new Date(ts).toISOString(),
    };
  });
}
