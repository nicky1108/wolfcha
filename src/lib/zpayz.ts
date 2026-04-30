import { createHash } from "node:crypto";

export const ZPAYZ_DEFAULT_BASE_URL = "https://zpayz.cn";
export const ZPAYZ_DEFAULT_PRICE_PER_CREDIT = 1;

export type ZpayzPayType = "alipay" | "wxpay";

export type ZpayzOrderParam = {
  userId: string;
  quantity: number;
  amount: string;
};

export function getZpayzBaseUrl(): string {
  return (process.env.ZPAYZ_BASE_URL || ZPAYZ_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function getZpayzPricePerCredit(): number {
  const configured = Number(process.env.ZPAYZ_PRICE_PER_CREDIT);
  return Number.isFinite(configured) && configured > 0 ? configured : ZPAYZ_DEFAULT_PRICE_PER_CREDIT;
}

export function formatCnyAmount(value: number): string {
  return value.toFixed(2);
}

export function getZpayzPayType(input?: string | null): ZpayzPayType {
  const candidate = (input || process.env.ZPAYZ_PAY_TYPE || "alipay").trim().toLowerCase();
  return candidate === "wxpay" ? "wxpay" : "alipay";
}

export function encodeZpayzParam(param: ZpayzOrderParam): string {
  return Buffer.from(JSON.stringify(param), "utf8").toString("base64url");
}

export function decodeZpayzParam(raw: string): ZpayzOrderParam | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<ZpayzOrderParam>;
    const quantity = Number(parsed.quantity);
    if (!parsed.userId || typeof parsed.userId !== "string") return null;
    if (!Number.isInteger(quantity) || quantity < 1) return null;
    if (!parsed.amount || typeof parsed.amount !== "string") return null;
    return {
      userId: parsed.userId,
      quantity,
      amount: parsed.amount,
    };
  } catch {
    return null;
  }
}

export function createZpayzOrderNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `WC${ts}${rand}`.slice(0, 32);
}

export function signZpayzParams(params: Record<string, string | number | null | undefined>, key: string): string {
  const source = Object.entries(params)
    .filter(([name, value]) => name !== "sign" && name !== "sign_type" && value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");

  return createHash("md5").update(`${source}${key}`).digest("hex").toLowerCase();
}

export function verifyZpayzSign(params: Record<string, string>, key: string): boolean {
  const provided = params.sign?.toLowerCase();
  if (!provided) return false;
  return signZpayzParams(params, key) === provided;
}
