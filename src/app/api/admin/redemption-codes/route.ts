import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

const CHAR_SET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_PREFIX = "wolf";
const SEGMENT_LENGTH = 4;
const SEGMENT_COUNT = 2;

type Payload = {
  count?: unknown;
  creditsAmount?: unknown;
};

function generateCode(): string {
  const segments: string[] = [];
  for (let segmentIndex = 0; segmentIndex < SEGMENT_COUNT; segmentIndex++) {
    const bytes = randomBytes(SEGMENT_LENGTH);
    let segment = "";
    for (let charIndex = 0; charIndex < SEGMENT_LENGTH; charIndex++) {
      segment += CHAR_SET[bytes[charIndex] % CHAR_SET.length];
    }
    segments.push(segment);
  }
  return `${CODE_PREFIX}-${segments.join("-")}`;
}

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if ("error" in auth) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const count = Number(payload.count ?? 10);
  const creditsAmount = Number(payload.creditsAmount ?? 5);

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return NextResponse.json({ error: "count must be between 1 and 500" }, { status: 400 });
  }

  if (!Number.isInteger(creditsAmount) || creditsAmount < 1 || creditsAmount > 1000) {
    return NextResponse.json({ error: "creditsAmount must be between 1 and 1000" }, { status: 400 });
  }

  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateCode());
  }

  const rows: Database["public"]["Tables"]["redemption_codes"]["Insert"][] = Array.from(codes).map((code) => ({
    code,
    credits_amount: creditsAmount,
    is_redeemed: false,
  }));

  const { data, error } = await supabaseAdmin
    .from("redemption_codes")
    .insert(rows as never[])
    .select("id, code, credits_amount, is_redeemed, redeemed_by, redeemed_at, created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedRows = (data ?? []) as Database["public"]["Tables"]["redemption_codes"]["Row"][];

  return NextResponse.json({
    success: true,
    codes: insertedRows.map((row) => row.code),
    rows: insertedRows,
  });
}
