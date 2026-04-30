import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/auth-server";
import { authenticateAdminRequest, getConfiguredAdminEmails } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type CreditRow = Database["public"]["Tables"]["user_credits"]["Row"];
type GameSessionRow = Database["public"]["Tables"]["game_sessions"]["Row"];
type RedemptionCodeRow = Database["public"]["Tables"]["redemption_codes"]["Row"];

type PaymentTransactionRow = {
  id: string;
  user_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  quantity: number | null;
  credits_added: number | null;
  status: string | null;
  created_at: string;
};

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(getDate(a) || "") || 0;
    const bTime = Date.parse(getDate(b) || "") || 0;
    return bTime - aTime;
  });
}

function getUserEmailMap(users: AppUser[]): Map<string, string> {
  return new Map(users.map((user) => [user.id, user.email || ""]));
}

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if ("error" in auth) return auth.error;

  const warnings: string[] = [];

  const [usersResult, creditsResult, paymentsResult, codesResult, sessionsResult] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin
      .from("user_credits")
      .select("id, credits, referral_code, referred_by, total_referrals, last_daily_bonus_at, created_at, updated_at"),
    supabaseAdmin
      .from("payment_transactions")
      .select("id, user_id, stripe_session_id, stripe_payment_intent_id, amount_cents, currency, quantity, credits_added, status, created_at")
      .limit(50),
    supabaseAdmin
      .from("redemption_codes")
      .select("id, code, credits_amount, is_redeemed, redeemed_by, redeemed_at, created_at")
      .limit(50),
    supabaseAdmin
      .from("game_sessions")
      .select("id, user_id, player_count, difficulty, winner, completed, rounds_played, duration_seconds, ai_calls_count, used_custom_key, model_used, user_email, region, created_at, ended_at")
      .limit(500),
  ]);

  if (usersResult.error) warnings.push(`Auth users: ${usersResult.error.message}`);
  if (creditsResult.error) warnings.push(`user_credits: ${creditsResult.error.message}`);
  if (paymentsResult.error) warnings.push(`payment_transactions: ${paymentsResult.error.message}`);
  if (codesResult.error) warnings.push(`redemption_codes: ${codesResult.error.message}`);
  if (sessionsResult.error) warnings.push(`game_sessions: ${sessionsResult.error.message}`);

  const users = usersResult.data?.users ?? [];
  const emailByUserId = getUserEmailMap(users);
  const credits = (creditsResult.data ?? []) as CreditRow[];
  const payments = (paymentsResult.data ?? []) as PaymentTransactionRow[];
  const redemptionCodes = (codesResult.data ?? []) as RedemptionCodeRow[];
  const sessions = (sessionsResult.data ?? []) as GameSessionRow[];

  const userRows = credits.map((credit) => ({
    id: credit.id,
    email: emailByUserId.get(credit.id) || "",
    credits: Number(credit.credits ?? 0),
    referralCode: credit.referral_code,
    totalReferrals: Number(credit.total_referrals ?? 0),
    createdAt: credit.created_at,
    updatedAt: credit.updated_at,
  }));

  const totalRevenueCents = payments
    .filter((payment) => payment.status === "completed")
    .reduce((sum, payment) => sum + Number(payment.amount_cents ?? 0), 0);
  const totalCredits = credits.reduce((sum, row) => sum + Number(row.credits ?? 0), 0);
  const completedSessions = sessions.filter((session) => session.completed).length;
  const redeemedCodes = redemptionCodes.filter((code) => code.is_redeemed).length;

  return NextResponse.json({
    admin: {
      email: auth.email,
      configuredAdminCount: getConfiguredAdminEmails().length,
      localDevFallback: process.env.NODE_ENV !== "production",
    },
    summary: {
      users: users.length || credits.length,
      totalCredits,
      completedSessions,
      paymentCount: payments.length,
      totalRevenueCents,
      redemptionCodeCount: redemptionCodes.length,
      redeemedCodes,
    },
    users: sortByDateDesc(userRows, (row) => row.updatedAt),
    payments: sortByDateDesc(
      payments.map((payment) => ({
        id: payment.id,
        userId: payment.user_id,
        email: emailByUserId.get(payment.user_id) || "",
        orderId: payment.stripe_session_id,
        providerTradeId: payment.stripe_payment_intent_id,
        amountCents: Number(payment.amount_cents ?? 0),
        currency: payment.currency || "cny",
        quantity: Number(payment.quantity ?? payment.credits_added ?? 0),
        status: payment.status || "unknown",
        createdAt: payment.created_at,
      })),
      (row) => row.createdAt
    ),
    redemptionCodes: sortByDateDesc(
      redemptionCodes.map((code) => ({
        id: code.id,
        code: code.code,
        creditsAmount: Number(code.credits_amount ?? 0),
        isRedeemed: Boolean(code.is_redeemed),
        redeemedBy: code.redeemed_by,
        redeemedEmail: code.redeemed_by ? emailByUserId.get(code.redeemed_by) || "" : "",
        redeemedAt: code.redeemed_at,
        createdAt: code.created_at,
      })),
      (row) => row.createdAt
    ),
    recentSessions: sortByDateDesc(
      sessions.slice(0, 20).map((session) => ({
        id: session.id,
        userId: session.user_id,
        email: session.user_email || emailByUserId.get(session.user_id) || "",
        completed: Boolean(session.completed),
        winner: session.winner,
        difficulty: session.difficulty,
        modelUsed: session.model_used,
        usedCustomKey: Boolean(session.used_custom_key),
        aiCallsCount: Number(session.ai_calls_count ?? 0),
        createdAt: session.created_at,
        endedAt: session.ended_at,
      })),
      (row) => row.createdAt
    ),
    warnings,
  });
}
