import { createPostgresAdminClient } from "@/lib/postgres-supabase-adapter";

// Compatibility name retained so existing API routes can move off Supabase
// without rewriting all business logic in one pass.
export const supabaseAdmin = createPostgresAdminClient();

export function ensureAdminClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!process.env.AUTH_SECRET && !process.env.SESSION_SECRET) {
    throw new Error("AUTH_SECRET is not configured");
  }
}
