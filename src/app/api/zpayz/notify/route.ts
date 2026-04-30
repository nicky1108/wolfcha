import { NextRequest, NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { decodeZpayzParam, formatCnyAmount, getZpayzPricePerCredit, verifyZpayzSign } from "@/lib/zpayz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function paramsFromRequest(request: NextRequest): Promise<Record<string, string>> {
  const params = new URLSearchParams(request.nextUrl.searchParams);

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      try {
        const formData = await request.formData();
        for (const [key, value] of formData.entries()) {
          if (typeof value === "string") params.set(key, value);
        }
      } catch (error) {
        console.warn("[ZPAYZ Notify] Could not parse POST callback body:", error);
      }
    }
  }

  return Object.fromEntries(params.entries());
}

async function handleNotify(request: NextRequest) {
  try {
    ensureAdminClient();
  } catch (error) {
    console.error("[ZPAYZ Notify] Server misconfiguration:", error);
    return textResponse("server error", 500);
  }

  const key = process.env.ZPAYZ_KEY?.trim();
  const pid = process.env.ZPAYZ_PID?.trim();
  if (!key || !pid) {
    console.error("[ZPAYZ Notify] Missing ZPAYZ_PID or ZPAYZ_KEY");
    return textResponse("server error", 500);
  }

  const params = await paramsFromRequest(request);

  if (params.pid !== pid) {
    console.error("[ZPAYZ Notify] PID mismatch", { received: params.pid });
    return textResponse("fail", 400);
  }

  if (!verifyZpayzSign(params, key)) {
    console.error("[ZPAYZ Notify] Signature verification failed", {
      outTradeNo: params.out_trade_no,
      tradeNo: params.trade_no,
    });
    return textResponse("fail", 400);
  }

  if (params.trade_status !== "TRADE_SUCCESS") {
    return textResponse("success");
  }

  const order = decodeZpayzParam(params.param || "");
  if (!order) {
    console.error("[ZPAYZ Notify] Invalid order param", { outTradeNo: params.out_trade_no });
    return textResponse("fail", 400);
  }

  const expectedAmount = formatCnyAmount(order.quantity * getZpayzPricePerCredit());
  const receivedAmount = formatCnyAmount(Number(params.money));
  if (order.amount !== expectedAmount || receivedAmount !== expectedAmount) {
    console.error("[ZPAYZ Notify] Amount mismatch", {
      outTradeNo: params.out_trade_no,
      orderAmount: order.amount,
      receivedAmount,
      expectedAmount,
    });
    return textResponse("fail", 400);
  }

  const outTradeNo = params.out_trade_no;
  const tradeNo = params.trade_no || outTradeNo;
  if (!outTradeNo) {
    return textResponse("fail", 400);
  }

  const { data: existingTx, error: existingTxError } = await supabaseAdmin
    .from("payment_transactions")
    .select("id")
    .eq("stripe_session_id", outTradeNo)
    .maybeSingle();

  if (!existingTxError && existingTx) {
    return textResponse("success");
  }

  if (existingTxError) {
    console.warn("[ZPAYZ Notify] Could not check payment_transactions idempotency:", existingTxError);
  }

  const { data: creditsData, error: creditsError } = await supabaseAdmin
    .from("user_credits")
    .select("credits")
    .eq("id", order.userId)
    .single();

  if (creditsError || !creditsData) {
    console.error("[ZPAYZ Notify] Failed to fetch credits", { userId: order.userId, creditsError });
    return textResponse("fail", 500);
  }

  const currentCredits = Number((creditsData as { credits: number | string }).credits ?? 0);
  const newCredits = currentCredits + order.quantity;

  const { error: updateError } = await supabaseAdmin
    .from("user_credits")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", order.userId);

  if (updateError) {
    console.error("[ZPAYZ Notify] Failed to update credits", { userId: order.userId, updateError });
    return textResponse("fail", 500);
  }

  const { error: txError } = await supabaseAdmin
    .from("payment_transactions")
    .insert({
      user_id: order.userId,
      stripe_session_id: outTradeNo,
      stripe_payment_intent_id: tradeNo,
      amount_cents: Math.round(Number(expectedAmount) * 100),
      currency: "cny",
      quantity: order.quantity,
      credits_added: order.quantity,
      status: "completed",
    } as never);

  if (txError) {
    console.warn("[ZPAYZ Notify] Credits added but transaction log failed:", txError);
  }

  console.log("[ZPAYZ Notify] Added credits", {
    userId: order.userId,
    outTradeNo,
    tradeNo,
    quantity: order.quantity,
    newCredits,
  });

  return textResponse("success");
}

export async function GET(request: NextRequest) {
  return handleNotify(request);
}

export async function POST(request: NextRequest) {
  return handleNotify(request);
}
