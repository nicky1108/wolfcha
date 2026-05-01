const rawAudioAssetBaseUrl = process.env.NEXT_PUBLIC_AUDIO_ASSET_BASE_URL?.trim() ?? "";

export const AUDIO_ASSET_BASE_URL = rawAudioAssetBaseUrl.replace(/\/+$/, "");

export function getStaticAudioAssetUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!AUDIO_ASSET_BASE_URL) return normalizedPath;
  return `${AUDIO_ASSET_BASE_URL}${normalizedPath}`;
}
