import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { dbQuery } from "@/lib/db";
import { buildRecordingShareUrl } from "@/lib/game-recording-share";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ShareRecordingRow = {
  id: string;
  share_token: string | null;
};

function isGuestUserId(userId: string): boolean {
  return userId.startsWith("guest_");
}

function createShareToken(): string {
  return randomBytes(24).toString("base64url");
}

function getRequestOrigin(request: Request): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/g, "");
  if (configuredOrigin) return configuredOrigin;

  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const protocol = forwardedProto || url.protocol.replace(/:$/g, "") || "https";
  return `${protocol}://${host}`;
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  if (isGuestUserId(auth.user.id)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Recording not found" }, { status: 404 });

  const existing = await dbQuery<ShareRecordingRow>(
    "select id, share_token from game_recordings where id = $1 and user_id = $2 limit 1",
    [id, auth.user.id]
  );
  const recording = existing.rows[0];
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  let shareToken = recording.share_token;
  if (!shareToken) {
    const candidateToken = createShareToken();
    const updated = await dbQuery<ShareRecordingRow>(
      `
        update game_recordings
        set
          share_token = $3,
          share_created_at = coalesce(share_created_at, now()),
          updated_at = now()
        where id = $1 and user_id = $2
          and share_token is null
        returning id, share_token
      `,
      [id, auth.user.id, candidateToken]
    );
    if (updated.rows[0]?.share_token) {
      shareToken = updated.rows[0].share_token;
    } else {
      const refreshed = await dbQuery<ShareRecordingRow>(
        "select id, share_token from game_recordings where id = $1 and user_id = $2 limit 1",
        [id, auth.user.id]
      );
      shareToken = refreshed.rows[0]?.share_token || candidateToken;
    }
  }

  return NextResponse.json({
    success: true,
    shareUrl: buildRecordingShareUrl(getRequestOrigin(request), id, shareToken),
  });
}
