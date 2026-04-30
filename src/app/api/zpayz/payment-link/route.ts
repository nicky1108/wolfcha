import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  createZpayzOrderNo,
  encodeZpayzParam,
  formatCnyAmount,
  getZpayzBaseUrl,
  getZpayzPayType,
  getZpayzPricePerCredit,
  signZpayzParams,
} from "@/lib/zpayz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_QUANTITY = 10;
const MAX_QUANTITY = 100;

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  const pid = process.env.ZPAYZ_PID?.trim();
  const key = process.env.ZPAYZ_KEY?.trim();

  if (!pid || !key) {
    console.error("[ZPAYZ Payment Link] Missing ZPAYZ_PID or ZPAYZ_KEY");
    return NextResponse.json(
      { error: "Payment configuration error. Please contact support." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { quantity?: unknown; type?: unknown };
  const quantity = Number(body.quantity);

  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `Invalid quantity. Must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}.` },
      { status: 400 }
    );
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const amount = formatCnyAmount(quantity * getZpayzPricePerCredit());
  const outTradeNo = createZpayzOrderNo();
  const param = encodeZpayzParam({
    userId: auth.user.id,
    quantity,
    amount,
  });

  const params: Record<string, string> = {
    pid,
    type: getZpayzPayType(typeof body.type === "string" ? body.type : undefined),
    out_trade_no: outTradeNo,
    notify_url: `${origin}/api/zpayz/notify`,
    return_url: origin,
    name: `Wolfcha ${quantity} game credits`,
    money: amount,
    param,
    sign_type: "MD5",
  };

  const cid = process.env.ZPAYZ_CID?.trim();
  if (cid) params.cid = cid;

  params.sign = signZpayzParams(params, key);

  const url = `${getZpayzBaseUrl()}/submit.php?${new URLSearchParams(params).toString()}`;

  return NextResponse.json({
    url,
    outTradeNo,
    amount,
    quantity,
  });
}
