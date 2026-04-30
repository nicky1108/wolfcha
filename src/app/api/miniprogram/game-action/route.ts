import { NextRequest, NextResponse } from "next/server";
import { MODEL_IDS } from "@/types/game";

export const dynamic = "force-dynamic";

const DEFAULT_PROVIDER = "tokendance";
const DEFAULT_MODEL = MODEL_IDS.tokendance.gpt54Mini;

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const role = record.role;
      const content = record.content;
      if (role !== "system" && role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string" || !content.trim()) return null;

      return { role, content: content.trim() };
    })
    .filter((item): item is ChatMessage => Boolean(item));
}

function collectTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      const record = asRecord(part);
      return typeof record?.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractAssistantContent(data: unknown): string {
  const root = asRecord(data);
  const choices = root?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";

  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const content = collectTextContent(message?.content);
  if (content.trim()) return content.trim();

  const text = firstChoice?.text;
  return typeof text === "string" ? text.trim() : "";
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function forwardedHeaders(request: NextRequest): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  for (const name of [
    "authorization",
    "x-guest-id",
    "x-zenmux-api-key",
    "x-dashscope-api-key",
    "x-tokendance-api-key",
    "x-tokendance-base-url",
  ]) {
    const value = request.headers.get(name)?.trim();
    if (value) headers[name] = value;
  }

  return headers;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = asRecord(parsed) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" && body.provider.trim()
    ? body.provider.trim()
    : DEFAULT_PROVIDER;
  const model = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : DEFAULT_MODEL;
  const temperature = typeof body.temperature === "number" && Number.isFinite(body.temperature)
    ? body.temperature
    : 0.8;
  const maxTokens = typeof body.max_tokens === "number" && Number.isFinite(body.max_tokens)
    ? Math.max(32, Math.floor(body.max_tokens))
    : 260;

  const chatResponse = await fetch(`${request.nextUrl.origin}/api/chat`, {
    method: "POST",
    headers: forwardedHeaders(request),
    body: JSON.stringify({
      model,
      provider,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      reasoning: { enabled: false },
    }),
  });

  const payload = await readJsonSafely(chatResponse);
  if (!chatResponse.ok) {
    return NextResponse.json(
      {
        error: "Game action request failed",
        details: payload,
      },
      { status: chatResponse.status }
    );
  }

  const content = extractAssistantContent(payload);
  if (!content) {
    return NextResponse.json(
      {
        error: "AI response did not include assistant content",
        details: payload,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    content,
    usage: asRecord(payload)?.usage ?? null,
    model,
    provider,
  });
}
