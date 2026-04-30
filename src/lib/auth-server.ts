import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { PoolClient } from "pg";
import { dbQuery, withTransaction } from "@/lib/db";

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_KEY_LENGTH = 64;

export type AppUser = {
  id: string;
  email: string;
  created_at: string;
  updated_at?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  identities?: unknown[];
};

export type AppSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: AppUser;
};

type TokenPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  user_metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
  email_confirmed_at: Date | string | null;
};

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function jsonBase64Url(value: unknown): string {
  return base64Url(JSON.stringify(value));
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return secret;
}

function sign(content: string): string {
  return createHmac("sha256", getAuthSecret()).update(content).digest("base64url");
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string | null): boolean {
  if (!passwordHash) return false;
  const [scheme, salt, expectedHash] = passwordHash.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;

  const actual = Buffer.from(scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("base64url"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function userFromRow(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    created_at: toIso(row.created_at) || new Date().toISOString(),
    updated_at: toIso(row.updated_at) || undefined,
    email_confirmed_at: toIso(row.email_confirmed_at),
    user_metadata: row.user_metadata || {},
    identities: [{ id: row.id, provider: "email" }],
  };
}

export function makeReferralCode(userId: string, prefix = "USER"): string {
  return `${prefix}${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export function createSession(user: AppUser): AppSession {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const header = jsonBase64Url({ alg: "HS256", typ: "JWT" });
  const body = jsonBase64Url(payload);
  const signature = sign(`${header}.${body}`);

  return {
    access_token: `${header}.${body}.${signature}`,
    token_type: "bearer",
    expires_in: TOKEN_TTL_SECONDS,
    expires_at: payload.exp,
    user,
  };
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sub || !payload.email || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getUserById(userId: string): Promise<AppUser | null> {
  const result = await dbQuery<UserRow>(
    "select id, email, password_hash, user_metadata, created_at, updated_at, email_confirmed_at from users where id = $1",
    [userId]
  );
  return result.rows[0] ? userFromRow(result.rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<(AppUser & { password_hash: string | null }) | null> {
  const result = await dbQuery<UserRow>(
    "select id, email, password_hash, user_metadata, created_at, updated_at, email_confirmed_at from users where email = $1",
    [normalizeEmail(email)]
  );
  if (!result.rows[0]) return null;
  return {
    ...userFromRow(result.rows[0]),
    password_hash: result.rows[0].password_hash,
  };
}

export async function ensureUserCredits(
  client: PoolClient,
  userId: string,
  initialCredits = 10
): Promise<void> {
  await client.query(
    `
      insert into user_credits (id, credits, referral_code, total_referrals)
      values ($1, $2, $3, 0)
      on conflict (id) do nothing
    `,
    [userId, initialCredits, makeReferralCode(userId)]
  );
}

export async function createPasswordUser(
  email: string,
  password: string,
  initialCredits = 10
): Promise<AppUser> {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = hashPassword(password);

  return withTransaction(async (client) => {
    const inserted = await client.query<UserRow>(
      `
        insert into users (email, password_hash, email_confirmed_at)
        values ($1, $2, now())
        returning id, email, password_hash, user_metadata, created_at, updated_at, email_confirmed_at
      `,
      [normalizedEmail, passwordHash]
    );
    const user = userFromRow(inserted.rows[0]);
    await ensureUserCredits(client, user.id, initialCredits);
    return user;
  });
}

export async function upsertOauthUser(
  email: string,
  metadata: Record<string, unknown>,
  initialCredits = 10
): Promise<AppUser> {
  const normalizedEmail = normalizeEmail(email);
  return withTransaction(async (client) => {
    const result = await client.query<UserRow>(
      `
        insert into users (email, user_metadata, email_confirmed_at)
        values ($1, $2::jsonb, now())
        on conflict (email) do update
          set user_metadata = excluded.user_metadata,
              updated_at = now()
        returning id, email, password_hash, user_metadata, created_at, updated_at, email_confirmed_at
      `,
      [normalizedEmail, JSON.stringify(metadata)]
    );
    const user = userFromRow(result.rows[0]);
    await ensureUserCredits(client, user.id, initialCredits);
    return user;
  });
}

export async function updateUserPassword(userId: string, password: string): Promise<AppUser | null> {
  const result = await dbQuery<UserRow>(
    `
      update users
      set password_hash = $2,
          updated_at = now()
      where id = $1
      returning id, email, password_hash, user_metadata, created_at, updated_at, email_confirmed_at
    `,
    [userId, hashPassword(password)]
  );
  return result.rows[0] ? userFromRow(result.rows[0]) : null;
}

export async function getUserFromToken(token: string): Promise<AppUser | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return getUserById(payload.sub);
}

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  return authHeader?.replace(/^Bearer\s+/i, "").trim() || null;
}

export function encodeSessionForRedirect(session: AppSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}
