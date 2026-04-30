"use client";

const SESSION_STORAGE_KEY = "wolfcha_self_hosted_session";
const REDIRECT_SESSION_KEY = "wolfcha_session";

export type User = {
  id: string;
  email?: string;
  created_at: string;
  updated_at?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  identities?: unknown[];
};

export type Session = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: User;
};

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

type AuthError = {
  message: string;
  status?: number;
  code?: string;
};

type AuthResponse<T> = {
  data: T;
  error: AuthError | null;
};

type AuthSubscriber = (event: AuthChangeEvent, session: Session | null) => void | Promise<void>;
type OAuthProvider = "google" | "watcha";
type OAuthSignInOptions = {
  provider?: OAuthProvider | string;
  options?: {
    redirectTo?: string;
  };
};

const subscribers = new Set<AuthSubscriber>();

function makeError(message: string, status?: number): AuthError {
  return { message, status };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function decodeRedirectSession(raw: string): Session | null {
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const json = atob(padded);
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

function readStoredSession(): Session | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function writeStoredSession(session: Session | null) {
  if (!isBrowser()) return;
  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function notify(event: AuthChangeEvent, session: Session | null) {
  for (const subscriber of subscribers) {
    void subscriber(event, session);
  }
}

function consumeRedirectSession(): Session | null {
  if (!isBrowser()) return null;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const raw = params.get(REDIRECT_SESSION_KEY);
  if (!raw) return null;

  const session = decodeRedirectSession(raw);
  params.delete(REDIRECT_SESSION_KEY);
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState(null, "", nextUrl);

  if (session?.access_token) {
    writeStoredSession(session);
    return session;
  }
  return null;
}

async function parseAuthResponse<T>(response: Response): Promise<AuthResponse<T>> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    return {
      data: payload as T,
      error: makeError(payload.error || `Request failed with status ${response.status}`, response.status),
    };
  }
  return { data: payload as T, error: null };
}

export const supabase = {
  auth: {
    async getSession(): Promise<AuthResponse<{ session: Session | null }>> {
      const redirected = consumeRedirectSession();
      if (redirected) {
        notify("SIGNED_IN", redirected);
        return { data: { session: redirected }, error: null };
      }
      return { data: { session: readStoredSession() }, error: null };
    },

    async getUser(): Promise<AuthResponse<{ user: User | null }>> {
      const session = consumeRedirectSession() || readStoredSession();
      return { data: { user: session?.user ?? null }, error: null };
    },

    onAuthStateChange(callback: AuthSubscriber) {
      subscribers.add(callback);
      void Promise.resolve().then(() => callback("INITIAL_SESSION", readStoredSession()));
      return {
        data: {
          subscription: {
            unsubscribe() {
              subscribers.delete(callback);
            },
          },
        },
      };
    },

    async signInWithPassword(credentials: { email: string; password: string }) {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const result = await parseAuthResponse<{ user?: User; session?: Session }>(response);
      if (result.error || !result.data.session) {
        return { data: { user: null, session: null }, error: result.error || makeError("Invalid login credentials") };
      }
      writeStoredSession(result.data.session);
      notify("SIGNED_IN", result.data.session);
      return { data: { user: result.data.user ?? result.data.session.user, session: result.data.session }, error: null };
    },

    async signUp(options: { email: string; password: string; options?: unknown }) {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: options.email, password: options.password }),
      });
      const result = await parseAuthResponse<{ user?: User; session?: Session | null }>(response);
      if (result.error) {
        return { data: { user: null, session: null }, error: result.error };
      }
      if (result.data.session) {
        writeStoredSession(result.data.session);
        notify("SIGNED_IN", result.data.session);
      }
      return {
        data: {
          user: result.data.user ?? result.data.session?.user ?? null,
          session: result.data.session ?? null,
        },
        error: null,
      };
    },

    async signOut() {
      writeStoredSession(null);
      notify("SIGNED_OUT", null);
      return { error: null };
    },

    async updateUser(attributes: { password?: string }) {
      const session = readStoredSession();
      if (!session?.access_token) {
        return { data: { user: null }, error: makeError("Auth session missing", 401) };
      }
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ password: attributes.password }),
      });
      const result = await parseAuthResponse<{ user?: User }>(response);
      if (result.error || !result.data.user) {
        return { data: { user: null }, error: result.error || makeError("Failed to update user") };
      }
      const nextSession = { ...session, user: result.data.user };
      writeStoredSession(nextSession);
      notify("USER_UPDATED", nextSession);
      return { data: { user: result.data.user }, error: null };
    },

    async resetPasswordForEmail(email: string, options?: unknown) {
      void options;
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return parseAuthResponse<Record<string, unknown>>(response);
    },

    async signInWithOAuth(options?: OAuthSignInOptions) {
      const provider = options?.provider;
      const providerRoutes: Record<OAuthProvider, string> = {
        google: "/api/auth/google",
        watcha: "/api/auth/watcha",
      };
      if (provider === "google" || provider === "watcha") {
        const url = providerRoutes[provider];
        if (isBrowser()) {
          window.location.assign(url);
        }
        return {
          data: { provider, url },
          error: null,
        };
      }
      return {
        data: { provider: null, url: null },
        error: makeError("Unsupported OAuth provider"),
      };
    },
  },
};
