import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireCredits } from "@/lib/api-auth";
import type { IncomingHttpHeaders } from "node:http";
import { createHash } from "node:crypto";
import * as https from "node:https";
import { URL } from "node:url";
import * as zlib from "node:zlib";
import { DEFAULT_VOICE_ID } from "@/lib/voice-constants";
import { dbQuery } from "@/lib/db";
import { makeSafeRecordingObjectKey } from "@/lib/game-recording-normalizer";
import type { TtsRecordingMetadata } from "@/lib/game-recording-types";
import { getOssUploadConfig, putBufferToOss } from "@/lib/oss-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const DEFAULT_TTS_SPEECH_RATE = 1.2;

const isGuestUserId = (userId: string) => userId.startsWith("guest_");

const resolveTtsSpeechRate = () => {
  const raw = process.env.MINIMAX_TTS_SPEED;
  if (!raw) return DEFAULT_TTS_SPEECH_RATE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TTS_SPEECH_RATE;
  return Math.min(2, Math.max(0.5, parsed));
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asFiniteInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function parseRecordingMetadata(parsed: Record<string, unknown>): TtsRecordingMetadata | null {
  const recordingId = asString(parsed.recordingId);
  const taskId = asString(parsed.taskId);
  if (!recordingId || !taskId) return null;
  return {
    recordingId,
    taskId,
    messageId: asString(parsed.messageId),
    playerId: asString(parsed.playerId),
    day: asFiniteInteger(parsed.day),
    phase: asString(parsed.phase),
    segmentIndex: asFiniteInteger(parsed.segmentIndex),
  };
}

function getAudioExtension(mime: string): string {
  if (mime === "audio/wav") return "wav";
  if (mime === "audio/ogg") return "ogg";
  return "mp3";
}

async function upsertRecordingAsset(input: {
  userId: string;
  metadata: TtsRecordingMetadata;
  voiceId: string;
  text: string;
  mimeType: string | null;
  bytes: number;
  ossKey: string | null;
  publicUrl: string | null;
  uploadStatus: "uploaded" | "failed" | "skipped";
  errorMessage?: string | null;
}): Promise<{ assetId: string | null; skippedOwner: boolean }> {
  const textHash = createHash("sha256").update(input.text).digest("hex");
  const result = await dbQuery<{ id: string }>(
    `
      with owner as (
        select id
        from game_recordings
        where id = $1 and user_id = $2
        limit 1
      ),
      matched_event as (
        select id
        from game_recording_events
        where recording_id = $1
          and (
            ($3::text is not null and task_id = $3)
            or ($4::text is not null and message_id = $4)
          )
        order by seq desc
        limit 1
      )
      insert into game_recording_assets (
        recording_id,
        event_id,
        task_id,
        provider,
        voice_id,
        text_hash,
        oss_key,
        public_url,
        mime_type,
        bytes,
        upload_status,
        error_message,
        updated_at
      )
      select
        owner.id,
        matched_event.id,
        $3,
        'minimax',
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        now()
      from owner
      left join matched_event on true
      on conflict (recording_id, task_id) do update
        set
          event_id = coalesce(excluded.event_id, game_recording_assets.event_id),
          voice_id = excluded.voice_id,
          text_hash = excluded.text_hash,
          oss_key = excluded.oss_key,
          public_url = excluded.public_url,
          mime_type = excluded.mime_type,
          bytes = excluded.bytes,
          upload_status = excluded.upload_status,
          error_message = excluded.error_message,
          updated_at = now()
      returning id
    `,
    [
      input.metadata.recordingId,
      input.userId,
      input.metadata.taskId,
      input.metadata.messageId || null,
      input.voiceId,
      textHash,
      input.ossKey,
      input.publicUrl,
      input.mimeType,
      input.bytes,
      input.uploadStatus,
      input.errorMessage || null,
    ]
  );

  return { assetId: result.rows[0]?.id ?? null, skippedOwner: result.rows.length === 0 };
}

async function persistRecordingAudio(input: {
  userId: string;
  metadata: TtsRecordingMetadata | null;
  buffer: Buffer;
  mimeType: string;
  voiceId: string;
  text: string;
}): Promise<Record<string, string>> {
  const recordingId = input.metadata?.recordingId;
  const taskId = input.metadata?.taskId;
  if (!input.metadata || !recordingId || !taskId || isGuestUserId(input.userId)) return {};

  const config = getOssUploadConfig();
  if (!config) {
    const skipped = await upsertRecordingAsset({
      userId: input.userId,
      metadata: input.metadata,
      voiceId: input.voiceId,
      text: input.text,
      mimeType: input.mimeType,
      bytes: input.buffer.length,
      ossKey: null,
      publicUrl: null,
      uploadStatus: "skipped",
      errorMessage: "OSS upload is not configured",
    }).catch((error) => {
      console.error("[recording-tts] Failed to mark skipped asset", error);
      return { assetId: null, skippedOwner: true };
    });
    return skipped.assetId
      ? {
          "X-Wolfcha-Recording-Asset-Id": skipped.assetId,
          "X-Wolfcha-Audio-Upload-Status": "skipped",
        }
      : {};
  }

  const key = makeSafeRecordingObjectKey({
    prefix: config.prefix,
    userId: input.userId,
    recordingId,
    taskId,
    extension: getAudioExtension(input.mimeType),
  });

  try {
    const uploaded = await putBufferToOss({
      config,
      key,
      body: input.buffer,
      contentType: input.mimeType,
    });
    const asset = await upsertRecordingAsset({
      userId: input.userId,
      metadata: input.metadata,
      voiceId: input.voiceId,
      text: input.text,
      mimeType: input.mimeType,
      bytes: input.buffer.length,
      ossKey: uploaded.key,
      publicUrl: uploaded.publicUrl,
      uploadStatus: "uploaded",
    });
    if (asset.skippedOwner) return {};
    return {
      ...(asset.assetId ? { "X-Wolfcha-Recording-Asset-Id": asset.assetId } : {}),
      "X-Wolfcha-Audio-Url": uploaded.publicUrl,
      "X-Wolfcha-Audio-Upload-Status": "uploaded",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OSS upload failed";
    console.error("[recording-tts] OSS upload failed", {
      recordingId: input.metadata.recordingId,
      taskId: input.metadata.taskId,
      error: message,
    });
    const asset = await upsertRecordingAsset({
      userId: input.userId,
      metadata: input.metadata,
      voiceId: input.voiceId,
      text: input.text,
      mimeType: input.mimeType,
      bytes: input.buffer.length,
      ossKey: key,
      publicUrl: null,
      uploadStatus: "failed",
      errorMessage: message.slice(0, 500),
    }).catch(() => ({ assetId: null, skippedOwner: false }));
    return {
      ...(asset.assetId ? { "X-Wolfcha-Recording-Asset-Id": asset.assetId } : {}),
      "X-Wolfcha-Audio-Upload-Status": "failed",
    };
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req as unknown as Request);
  if ("error" in auth) return auth.error;

  const headerApiKey = req.headers.get("x-minimax-api-key")?.trim();
  if (!headerApiKey) {
    const hasCredits = await requireCredits(auth.user.id);
    if (!hasCredits) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 403 });
    }
  }

  try {
    const parsedRaw: unknown = await req.json().catch(() => ({}));
    const parsed = asRecord(parsedRaw) ?? {};
    const text = typeof parsed?.text === "string" ? parsed.text : String(parsed?.text ?? "");
    const voiceId = typeof parsed?.voiceId === "string" ? parsed.voiceId : String(parsed?.voiceId ?? "");
    const recordingMetadata = parseRecordingMetadata(parsed);

    const normText = text.trim();
    const normVoiceId = voiceId.trim();

    if (!normText || !normVoiceId) {
      return NextResponse.json({ error: "Missing text or voiceId" }, { status: 400 });
    }

    const headerApiKey = req.headers.get("x-minimax-api-key")?.trim();
    const headerGroupId = req.headers.get("x-minimax-group-id")?.trim();
    const apiKey = headerApiKey || process.env.MINIMAX_API_KEY;
    const groupId = headerGroupId || process.env.MINIMAX_GROUP_ID;

    if (!apiKey) {
      console.error("Missing MiniMax credentials");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // MiniMax T2A V2 API Endpoint
    // 参考文档：https://platform.minimaxi.com/document/T2A%20V2
    const baseUrlFromEnv = process.env.MINIMAX_API_BASE_URL;
    const primaryBaseUrl = (baseUrlFromEnv || "https://api.minimax.chat").replace(/\/+$/, "");

    const isNativeMiniMaxBaseUrl = (baseUrl: string) => {
      try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        return hostname.endsWith("minimax.chat") || hostname.endsWith("minimaxi.com");
      } catch {
        return false;
      }
    };

    const useOpenAiSpeechEndpoint = !isNativeMiniMaxBaseUrl(primaryBaseUrl);

    const candidateBaseUrls = [primaryBaseUrl];
    if (!baseUrlFromEnv) {
      // 自动兜底另一个域名，避免因为平台（minimax.chat vs minimaxi.com）差异导致连不通
      candidateBaseUrls.push(
        primaryBaseUrl.includes("minimaxi.com")
          ? "https://api.minimax.chat"
          : "https://api.minimaxi.com"
      );
    }

    const ttsModel = process.env.MINIMAX_TTS_MODEL || "speech-01-turbo";
    const speechRate = resolveTtsSpeechRate();

    const buildNativePayload = (voiceIdForRequest: string) => ({
      model: ttsModel,
      text: normText,
      stream: false, // 暂时不使用流式，简化前端处理
      voice_setting: {
        voice_id: voiceIdForRequest,
        speed: speechRate,
        vol: 1.0,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    });

    const buildOpenAiSpeechPayload = (voiceIdForRequest: string) => ({
      model: ttsModel,
      input: normText,
      voice: voiceIdForRequest,
      speed: speechRate,
      output_format: "hex",
    });

    const requestBuffer = async (inputUrl: string, init: {
      method: "GET" | "POST";
      headers?: Record<string, string>;
      body?: string;
      timeoutMs: number;
    }): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: Buffer }> => {
      const u = new URL(inputUrl);
      if (u.protocol !== "https:") {
        throw new Error(`Unsupported protocol: ${u.protocol}`);
      }

      return await new Promise((resolve, reject) => {
        const req2 = https.request(
          {
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port ? Number(u.port) : 443,
            path: `${u.pathname}${u.search}`,
            method: init.method,
            headers: init.headers,
            family: 4,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
            res.on("end", () => {
              const raw = Buffer.concat(chunks);

              const enc = res.headers["content-encoding"];
              const encStr = Array.isArray(enc) ? enc.join(",") : enc;

              let body = raw;
              try {
                if (typeof encStr === "string" && encStr) {
                  const e = encStr.toLowerCase();
                  if (e.includes("br")) body = zlib.brotliDecompressSync(raw);
                  else if (e.includes("gzip")) body = zlib.gunzipSync(raw);
                  else if (e.includes("deflate")) body = zlib.inflateSync(raw);
                }
              } catch (decompressErr) {
                // 解压失败就回退到原始内容，并在上层用可读错误定位
                console.error("MiniMax response decompress failed:", decompressErr);
                body = raw;
              }

              resolve({
                statusCode: res.statusCode || 0,
                headers: res.headers,
                body,
              });
            });
          }
        );

        req2.on("error", reject);
        req2.setTimeout(init.timeoutMs, () => {
          req2.destroy(new Error("RequestTimeout"));
        });

        if (init.body) req2.write(init.body);
        req2.end();
      });
    };

    const bufferToArrayBuffer = (b: Buffer): ArrayBuffer => {
      const ab = new ArrayBuffer(b.byteLength);
      new Uint8Array(ab).set(b);
      return ab;
    };

    const sniffAudioMime = (b: Buffer): { mime: string | null; reason?: string } => {
      if (!b || b.length < 4) return { mime: null, reason: "empty_or_too_short" };

      // WAV: RIFF....WAVE
      if (b.length >= 12 && b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WAVE") {
        return { mime: "audio/wav" };
      }

      // OGG
      if (b.slice(0, 4).toString("ascii") === "OggS") {
        return { mime: "audio/ogg" };
      }

      // MP3: ID3 tag or frame sync 0xFFE?
      if (b.slice(0, 3).toString("ascii") === "ID3") {
        return { mime: "audio/mpeg" };
      }
      if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
        return { mime: "audio/mpeg" };
      }

      // If it looks like text/json, treat as non-audio
      const head = b.slice(0, 64).toString("utf8").trim();
      if (head.startsWith("{") || head.startsWith("[") || head.toLowerCase().includes("error")) {
        return { mime: null, reason: "looks_like_text_or_json" };
      }

      return { mime: null, reason: "unknown_format" };
    };

    const respondAudio = async (b: Buffer, extraHeaders?: Record<string, string>) => {
      const sniff = sniffAudioMime(b);
      if (!sniff.mime) {
        const preview = b.slice(0, 400).toString("utf8");
        return NextResponse.json(
          {
            error: "TTS audio is not in a supported format.",
            reason: sniff.reason,
            byteLength: b.length,
            preview,
          },
          { status: 502 }
        );
      }

      const recordingHeaders = await persistRecordingAudio({
        userId: auth.user.id,
        metadata: recordingMetadata,
        buffer: b,
        mimeType: sniff.mime,
        voiceId: extraHeaders?.["X-Minimax-Voice-Id-Used"] || normVoiceId,
        text: normText,
      });

      return new NextResponse(bufferToArrayBuffer(b), {
        headers: {
          "Content-Type": sniff.mime,
          "Content-Length": b.length.toString(),
          ...recordingHeaders,
          ...(extraHeaders ?? {}),
        },
      });
    };

    const pickFallbackVoiceId = (badVoiceId: string) => {
      const v = badVoiceId.toLowerCase();
      if (v.startsWith("female") || v.includes("female")) return DEFAULT_VOICE_ID.female;
      return DEFAULT_VOICE_ID.male;
    };

    const requestMiniMax = async (voiceIdForRequest: string) => {
      let response: { statusCode: number; headers: IncomingHttpHeaders; body: Buffer } | null = null;
      let lastError: unknown = null;

      for (const baseUrl of candidateBaseUrls) {
        const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
        const url = useOpenAiSpeechEndpoint
          ? `${normalizedBaseUrl}/v1/audio/speech`
          : `${normalizedBaseUrl}/v1/t2a_v2?GroupId=${encodeURIComponent(groupId ?? "")}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",
        };
        if (!useOpenAiSpeechEndpoint && groupId) {
          headers.GroupId = groupId;
        }
        const body = useOpenAiSpeechEndpoint
          ? buildOpenAiSpeechPayload(voiceIdForRequest)
          : buildNativePayload(voiceIdForRequest);

        try {
          response = await requestBuffer(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            timeoutMs: 30000,
          });
          break;
        } catch (e) {
          lastError = e;
          continue;
        }
      }

      if (!response) {
        const attempted = candidateBaseUrls.join(", ");
        console.error("MiniMax fetch failed. attempted base urls:", attempted, lastError);
      }

      return response;
    };

    let usedVoiceId = normVoiceId;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await requestMiniMax(usedVoiceId);

      if (!response) {
        return NextResponse.json(
          {
            error:
              "MiniMax fetch failed (connect timeout / network). Please set MINIMAX_API_BASE_URL to the correct domain (https://api.minimaxi.com or https://api.minimax.chat) and ensure your network can reach it.",
            attemptedBaseUrls: candidateBaseUrls,
          },
          { status: 502 }
        );
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const errorText = response.body.toString("utf8");
        console.error("MiniMax API Error:", response.statusCode, errorText);
        return NextResponse.json({ error: `MiniMax API error: ${errorText}` }, { status: response.statusCode || 502 });
      }

      const contentType = response.headers["content-type"];

      if (typeof contentType === "string" && contentType.includes("application/json")) {
        let json: unknown;
        try {
          json = JSON.parse(response.body.toString("utf8"));
        } catch (e) {
          const preview = response.body.slice(0, 600).toString("utf8");
          console.error("MiniMax JSON parse failed:", e, { preview });
          return NextResponse.json(
            { error: "MiniMax JSON parse failed", preview },
            { status: 502 }
          );
        }

        const jsonRecord = asRecord(json) ?? {};
        const baseResp = asRecord(jsonRecord.base_resp);
        const dataRecord = asRecord(jsonRecord.data);
        const audioRecord = asRecord(jsonRecord.audio);

        if (baseResp && baseResp.status_code !== 0) {
          const code = Number(baseResp.status_code);
          const msg = String(baseResp.status_msg || "");

          if (code === 2054 && attempt === 0) {
            const fallback = pickFallbackVoiceId(usedVoiceId);
            if (fallback !== usedVoiceId) {
              usedVoiceId = fallback;
              continue;
            }
          }

          console.error("MiniMax base_resp error:", {
            status_code: code,
            status_msg: msg,
            voiceId: usedVoiceId,
            textPreview: String(normText).slice(0, 200),
          });
          return NextResponse.json(
            {
              error: "MiniMax base_resp error",
              status_code: code,
              status_msg: msg,
              voiceId: usedVoiceId,
              textPreview: String(normText).slice(0, 200),
            },
            { status: 502 }
          );
        }

        const dataStr: unknown =
          (typeof jsonRecord.data === "string" ? jsonRecord.data : undefined) ??
          dataRecord?.audio ??
          dataRecord?.data ??
          audioRecord?.data ??
          jsonRecord.audio_data;

        const audioUrl: unknown = audioRecord?.url ?? dataRecord?.url ?? jsonRecord.url;

        if (typeof audioUrl === "string" && audioUrl.startsWith("http")) {
          const audioResp = await requestBuffer(audioUrl, {
            method: "GET",
            headers: {
              "Accept-Encoding": "identity",
            },
            timeoutMs: 30000,
          });
          if (audioResp.statusCode < 200 || audioResp.statusCode >= 300) {
            return NextResponse.json({ error: `MiniMax audio url fetch failed: ${audioResp.statusCode}` }, { status: 502 });
          }

          return respondAudio(audioResp.body, {
            "X-Minimax-Voice-Id-Requested": normVoiceId,
            "X-Minimax-Voice-Id-Used": usedVoiceId,
          });
        }

        if (typeof dataStr === "string" && dataStr.trim()) {
          const t = dataStr.trim();

          const maybeB64 = t.startsWith("data:") ? t.split(",").slice(1).join(",") : t;
          const looksLikeBase64 = /[+/=]/.test(maybeB64);
          const looksLikeHex = !looksLikeBase64 && /^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0;

          let buffer: Buffer;
          let altBuffer: Buffer | null = null;

          if (looksLikeHex) {
            buffer = Buffer.from(t, "hex");
            try {
              altBuffer = Buffer.from(maybeB64, "base64");
            } catch {
              altBuffer = null;
            }
          } else {
            buffer = Buffer.from(maybeB64, "base64");
            if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0) {
              try {
                altBuffer = Buffer.from(t, "hex");
              } catch {
                altBuffer = null;
              }
            }
          }

          const primarySniff = sniffAudioMime(buffer);
          if (!primarySniff.mime && altBuffer) {
            const altSniff = sniffAudioMime(altBuffer);
            if (altSniff.mime) {
              buffer = altBuffer;
            }
          }

          return respondAudio(buffer, {
            "X-Minimax-Voice-Id-Requested": normVoiceId,
            "X-Minimax-Voice-Id-Used": usedVoiceId,
          });
        }
      }

      return respondAudio(response.body, {
        "X-Minimax-Voice-Id-Requested": normVoiceId,
        "X-Minimax-Voice-Id-Used": usedVoiceId,
      });
    }

    return NextResponse.json(
      {
        error: "MiniMax voiceId retry exhausted",
        voiceId: usedVoiceId,
        textPreview: String(normText).slice(0, 200),
      },
      { status: 502 }
    );

  } catch (error) {
    console.error("TTS API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
