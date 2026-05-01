import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { dbQuery } from "@/lib/db";
import {
  getAdminGameSessionTotalPages,
  normalizeAdminGameSessionPageParams,
} from "@/lib/admin-game-sessions";

export const dynamic = "force-dynamic";

type GameSessionAdminRow = {
  id: string;
  user_id: string;
  email: string | null;
  player_count: number | string;
  difficulty: string | null;
  winner: "wolf" | "villager" | null;
  completed: boolean;
  rounds_played: number | string;
  duration_seconds: number | string | null;
  ai_calls_count: number | string;
  ai_input_chars: number | string;
  ai_output_chars: number | string;
  ai_prompt_tokens: number | string;
  ai_completion_tokens: number | string;
  used_custom_key: boolean;
  model_used: string | null;
  region: string | null;
  created_at: string;
  ended_at: string | null;
};

type CountRow = {
  total: number | string;
};

function buildWhereClause(params: {
  query: string;
  status: "all" | "completed" | "active";
  values: unknown[];
}): string {
  const clauses: string[] = [];
  const { values } = params;

  if (params.status === "completed") {
    clauses.push("gs.completed = true");
  } else if (params.status === "active") {
    clauses.push("gs.completed = false");
  }

  if (params.query) {
    values.push(`%${params.query}%`);
    const index = values.length;
    clauses.push(
      `(gs.id ilike $${index} or gs.user_id ilike $${index} or coalesce(gs.user_email, u.email, '') ilike $${index} or coalesce(gs.model_used, '') ilike $${index})`
    );
  }

  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function toSession(row: GameSessionAdminRow) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email || "",
    playerCount: Number(row.player_count ?? 0),
    difficulty: row.difficulty,
    winner: row.winner,
    completed: Boolean(row.completed),
    roundsPlayed: Number(row.rounds_played ?? 0),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    aiCallsCount: Number(row.ai_calls_count ?? 0),
    aiInputChars: Number(row.ai_input_chars ?? 0),
    aiOutputChars: Number(row.ai_output_chars ?? 0),
    aiPromptTokens: Number(row.ai_prompt_tokens ?? 0),
    aiCompletionTokens: Number(row.ai_completion_tokens ?? 0),
    usedCustomKey: Boolean(row.used_custom_key),
    modelUsed: row.model_used,
    region: row.region,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const pageParams = normalizeAdminGameSessionPageParams(searchParams);

  const countValues: unknown[] = [];
  const whereClause = buildWhereClause({
    query: pageParams.query,
    status: pageParams.status,
    values: countValues,
  });

  const countResult = await dbQuery<CountRow>(
    `
      select count(*)::integer as total
      from game_sessions gs
      left join users u on u.id = gs.user_id
      ${whereClause}
    `,
    countValues
  );

  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = getAdminGameSessionTotalPages(total, pageParams.pageSize);
  const page = Math.min(pageParams.page, totalPages);
  const offset = (page - 1) * pageParams.pageSize;
  const rowsValues = [...countValues, pageParams.pageSize, offset];
  const limitIndex = rowsValues.length - 1;
  const offsetIndex = rowsValues.length;
  const sessionsResult = await dbQuery<GameSessionAdminRow>(
    `
      select
        gs.id,
        gs.user_id,
        coalesce(gs.user_email, u.email, '') as email,
        gs.player_count,
        gs.difficulty,
        gs.winner,
        gs.completed,
        gs.rounds_played,
        gs.duration_seconds,
        gs.ai_calls_count,
        gs.ai_input_chars,
        gs.ai_output_chars,
        gs.ai_prompt_tokens,
        gs.ai_completion_tokens,
        gs.used_custom_key,
        gs.model_used,
        gs.region,
        gs.created_at,
        gs.ended_at
      from game_sessions gs
      left join users u on u.id = gs.user_id
      ${whereClause}
      order by gs.created_at desc, gs.id desc
      limit $${limitIndex} offset $${offsetIndex}
    `,
    rowsValues
  );

  return NextResponse.json({
    page,
    pageSize: pageParams.pageSize,
    total,
    totalPages,
    sessions: sessionsResult.rows.map(toSession),
  });
}
