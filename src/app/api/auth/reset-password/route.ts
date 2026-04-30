import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "Password reset email is not configured for the self-hosted auth service. Please sign in and change your password from account settings.",
    },
    { status: 501 }
  );
}
