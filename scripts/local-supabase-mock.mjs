#!/usr/bin/env node

import http from "node:http";
import { randomUUID } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = 54321;
const EMAIL = "demo@wolfcha.dev";
const PASSWORD = "Wolfcha2026!";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN = `mock-access-token-${USER_ID}`;
const REFRESH_TOKEN = `mock-refresh-token-${USER_ID}`;

const nowIso = () => new Date().toISOString();

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: EMAIL,
  email_confirmed_at: nowIso(),
  phone: "",
  confirmed_at: nowIso(),
  last_sign_in_at: nowIso(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { purpose: "local-dev-demo" },
  identities: [
    {
      id: USER_ID,
      user_id: USER_ID,
      identity_data: { email: EMAIL, sub: USER_ID },
      provider: "email",
      last_sign_in_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
  created_at: nowIso(),
  updated_at: nowIso(),
  is_anonymous: false,
};

const tables = {
  demo_config: [
    {
      id: "default",
      enabled: false,
      starts_at: null,
      expires_at: null,
      updated_at: nowIso(),
      updated_by: null,
      notes: "Local mock config",
    },
  ],
  user_credits: [
    {
      id: USER_ID,
      credits: 50,
      referral_code: "DEMO11111111",
      referred_by: null,
      total_referrals: 0,
      last_daily_bonus_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
  campaign_daily_quota: [],
  custom_characters: [],
  game_sessions: [],
  referral_records: [],
  redemption_codes: [],
  redemption_records: [],
  payment_transactions: [],
  sponsor_clicks: [],
};

function send(res, status, payload, extraHeaders = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": [
      "accept-profile",
      "apikey",
      "authorization",
      "cache-control",
      "content-profile",
      "content-type",
      "prefer",
      "range",
      "x-client-info",
      "x-supabase-api-version",
    ].join(", "),
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-max-age": "86400",
    "content-type": "application/json",
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function bearerUser(req) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  return token === ACCESS_TOKEN || token === REFRESH_TOKEN ? user : null;
}

function sessionPayload() {
  const expiresIn = 3600;
  return {
    access_token: ACCESS_TOKEN,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: REFRESH_TOKEN,
    user,
  };
}

function applyFilters(rows, searchParams) {
  let result = [...rows];
  for (const [key, value] of searchParams.entries()) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    if (!value.startsWith("eq.")) continue;
    const expected = value.slice(3);
    result = result.filter((row) => String(row[key]) === expected);
  }
  const limitParam = searchParams.get("limit");
  const limit = limitParam === null ? NaN : Number(limitParam);
  if (Number.isFinite(limit) && limit >= 0) {
    result = result.slice(0, limit);
  }
  return result;
}

function selectColumns(row, select) {
  if (!row || !select || select === "*") return row;
  const columns = select.split(",").map((part) => part.trim()).filter(Boolean);
  if (!columns.length) return row;
  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}

function wantsObject(req) {
  return String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
}

function tableInsertDefaults(table) {
  if (table === "custom_characters") {
    return { is_deleted: false };
  }
  return {};
}

function handleRest(req, res, url) {
  const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").split("/")[0]);
  if (!table) return send(res, 404, { message: "Missing table" });
  if (!tables[table]) tables[table] = [];

  const rows = tables[table];

  if (req.method === "GET" || req.method === "HEAD") {
    const filtered = applyFilters(rows, url.searchParams).map((row) =>
      selectColumns(row, url.searchParams.get("select"))
    );

    if (wantsObject(req)) {
      if (!filtered.length) {
        return send(res, 406, {
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        });
      }
      return send(res, 200, filtered[0]);
    }

    return send(res, 200, filtered, {
      "content-range": `0-${Math.max(filtered.length - 1, 0)}/${filtered.length}`,
    });
  }

  if (req.method === "POST") {
    return readBody(req).then((body) => {
      const items = Array.isArray(body) ? body : [body];
      const inserted = items.map((item) => {
        const next = {
          id: item.id || randomUUID(),
          created_at: item.created_at || nowIso(),
          updated_at: item.updated_at || nowIso(),
          ...tableInsertDefaults(table),
          ...item,
        };
        const existingIndex = rows.findIndex((row) => row.id === next.id);
        if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...next };
        else rows.push(next);
        return next;
      });
      const selected = inserted.map((row) => selectColumns(row, url.searchParams.get("select")));
      return send(res, 201, wantsObject(req) ? selected[0] : selected);
    });
  }

  if (req.method === "PATCH") {
    return readBody(req).then((body) => {
      const filtered = applyFilters(rows, url.searchParams);
      const updated = filtered.map((row) => {
        Object.assign(row, body, { updated_at: body.updated_at || nowIso() });
        return selectColumns(row, url.searchParams.get("select"));
      });
      return send(res, 200, wantsObject(req) ? updated[0] ?? null : updated);
    });
  }

  return send(res, 405, { message: "Method not allowed" });
}

async function handleAuth(req, res, url) {
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const body = await readBody(req);
    if (body.email === EMAIL && body.password === PASSWORD) return send(res, 200, sessionPayload());
    return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
  }

  if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
    const body = await readBody(req);
    if (body.email && body.password) return send(res, 200, sessionPayload());
    return send(res, 400, { message: "Signup requires a valid email and password" });
  }

  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const currentUser = bearerUser(req);
    if (!currentUser) return send(res, 401, { message: "Invalid token" });
    return send(res, 200, currentUser);
  }

  if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
    return send(res, 204);
  }

  if (url.pathname === "/auth/v1/recover" && req.method === "POST") {
    return send(res, 200, {});
  }

  if (url.pathname === "/auth/v1/admin/users" && req.method === "GET") {
    return send(res, 200, {
      users: [user],
      aud: "authenticated",
      page: Number(url.searchParams.get("page") || 1),
      per_page: Number(url.searchParams.get("per_page") || 1000),
      total: 1,
    });
  }

  if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
    return send(res, 200, { user });
  }

  if (url.pathname.startsWith("/auth/v1/admin/users/") && ["PUT", "PATCH"].includes(req.method)) {
    return send(res, 200, { user });
  }

  return send(res, 404, { message: "Auth route not implemented in local mock" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    return send(res, 204);
  }

  if (url.pathname.startsWith("/auth/v1/")) {
    return handleAuth(req, res, url);
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    return handleRest(req, res, url);
  }

  return send(res, 404, { message: "Local Supabase mock route not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Local Supabase mock listening on http://${HOST}:${PORT}`);
  console.log(`Demo account: ${EMAIL} / ${PASSWORD}`);
});
