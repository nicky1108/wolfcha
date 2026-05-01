export const ADMIN_GAME_SESSION_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_ADMIN_GAME_SESSION_PAGE_SIZE = 20;

export type AdminGameSessionStatus = "all" | "completed" | "active";

export type AdminGameSessionPageParams = {
  page: number;
  pageSize: number;
  offset: number;
  query: string;
  status: AdminGameSessionStatus;
};

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export function normalizeAdminGameSessionStatus(value: string | null): AdminGameSessionStatus {
  if (value === "completed" || value === "active") return value;
  return "all";
}

export function normalizeAdminGameSessionPageParams(
  searchParams: URLSearchParams
): AdminGameSessionPageParams {
  const page = parsePositiveInteger(searchParams.get("page"), 1);
  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_ADMIN_GAME_SESSION_PAGE_SIZE
  );
  const pageSize = ADMIN_GAME_SESSION_PAGE_SIZE_OPTIONS.includes(
    requestedPageSize as (typeof ADMIN_GAME_SESSION_PAGE_SIZE_OPTIONS)[number]
  )
    ? requestedPageSize
    : DEFAULT_ADMIN_GAME_SESSION_PAGE_SIZE;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    query: (searchParams.get("q") || "").trim().slice(0, 120),
    status: normalizeAdminGameSessionStatus(searchParams.get("status")),
  };
}

export function getAdminGameSessionTotalPages(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}
