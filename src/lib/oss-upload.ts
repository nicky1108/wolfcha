import { createHmac } from "node:crypto";

export type OssUploadConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  publicBaseUrl: string;
  prefix: string;
};

export type OssUploadResult = {
  key: string;
  publicUrl: string;
  etag: string | null;
};

const OSS_UPLOAD_TIMEOUT_MS = 8000;

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

export function getOssUploadConfig(): OssUploadConfig | null {
  const endpoint = (process.env.ALIYUN_OSS_ENDPOINT || process.env.ALIYUN_OSS_REGION || "").trim();
  const bucket = (process.env.ALIYUN_OSS_BUCKET || "").trim();
  const accessKeyId = (process.env.ALIYUN_OSS_ACCESS_KEY_ID || "").trim();
  const accessKeySecret = (process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || "").trim();
  const publicBaseUrl = (process.env.ALIYUN_OSS_PUBLIC_BASE_URL || "").trim();
  const prefix = trimSlashes(process.env.ALIYUN_OSS_RECORDING_PREFIX || "recordings");

  if (!endpoint || !bucket || !accessKeyId || !accessKeySecret || !publicBaseUrl) {
    return null;
  }

  return {
    endpoint: normalizeEndpoint(endpoint),
    bucket,
    accessKeyId,
    accessKeySecret,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/g, ""),
    prefix,
  };
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function getPublicUrl(config: OssUploadConfig, key: string): string {
  return `${config.publicBaseUrl}/${encodeObjectKey(key)}`;
}

function buildAuthorization(input: {
  config: OssUploadConfig;
  method: "PUT";
  key: string;
  contentType: string;
  date: string;
}): string {
  const resource = `/${input.config.bucket}/${input.key}`;
  const stringToSign = `${input.method}\n\n${input.contentType}\n${input.date}\n${resource}`;
  const signature = createHmac("sha1", input.config.accessKeySecret)
    .update(stringToSign)
    .digest("base64");
  return `OSS ${input.config.accessKeyId}:${signature}`;
}

export async function putBufferToOss(input: {
  config: OssUploadConfig;
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<OssUploadResult> {
  const date = new Date().toUTCString();
  const url = `https://${input.config.bucket}.${input.config.endpoint}/${encodeObjectKey(input.key)}`;
  const body = input.body.buffer.slice(
    input.body.byteOffset,
    input.body.byteOffset + input.body.byteLength
  ) as ArrayBuffer;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OSS_UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: buildAuthorization({
          config: input.config,
          method: "PUT",
          key: input.key,
          contentType: input.contentType,
          date,
        }),
        Date: date,
        "Content-Type": input.contentType,
        "Content-Length": String(input.body.length),
        "Cache-Control": input.cacheControl || "public, max-age=31536000, immutable",
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OSS upload failed: ${response.status} ${body.slice(0, 300)}`);
  }

  return {
    key: input.key,
    publicUrl: getPublicUrl(input.config, input.key),
    etag: response.headers.get("etag"),
  };
}
