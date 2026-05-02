export const RECORDING_SHARE_QUERY_PARAM = "share";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

export function buildRecordingSharePath(recordingId: string, shareToken: string): string {
  return `/recordings/${encodeURIComponent(recordingId)}?${RECORDING_SHARE_QUERY_PARAM}=${encodeURIComponent(shareToken)}`;
}

export function buildRecordingAnalysisSharePath(recordingId: string, shareToken: string): string {
  return `/recordings/${encodeURIComponent(recordingId)}/analysis?${RECORDING_SHARE_QUERY_PARAM}=${encodeURIComponent(shareToken)}`;
}

export function buildRecordingShareUrl(origin: string, recordingId: string, shareToken: string): string {
  return `${trimTrailingSlashes(origin)}${buildRecordingSharePath(recordingId, shareToken)}`;
}
