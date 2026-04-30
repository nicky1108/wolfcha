import { dbQuery } from "@/lib/db";
import {
  getUserById,
  getUserFromToken,
  userFromRow,
  type AppUser,
} from "@/lib/auth-server";

type SupabaseLikeError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

type QueryResponse<T = unknown> = {
  data: T | null;
  error: SupabaseLikeError | null;
};

type FilterOp = "=" | ">=" | "<=" | "<" | ">";

type Filter = {
  column: string;
  op: FilterOp;
  value: unknown;
};

type OrderClause = {
  column: string;
  ascending: boolean;
};

type QueryOperation = "select" | "insert" | "update" | "upsert";

const ALLOWED_TABLES = new Set([
  "user_credits",
  "referral_records",
  "campaign_daily_quota",
  "custom_characters",
  "demo_config",
  "sponsor_clicks",
  "redemption_codes",
  "redemption_records",
  "game_sessions",
  "payment_transactions",
]);

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function normalizeRows(values: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(values) ? values : [values];
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Insert/update payload must be an object");
    }
    return Object.fromEntries(
      Object.entries(row as Record<string, unknown>).filter(([, value]) => value !== undefined)
    );
  });
}

function parseColumns(columns?: string): string {
  if (!columns || columns.trim() === "*" || columns.trim() === "") return "*";
  return columns
    .split(",")
    .map((column) => quoteIdentifier(column.trim()))
    .join(", ");
}

function toSupabaseError(error: unknown): SupabaseLikeError {
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown; detail?: unknown };
    return {
      message: typeof record.message === "string" ? record.message : "Database query failed",
      code: typeof record.code === "string" ? record.code : undefined,
      details: typeof record.detail === "string" ? record.detail : null,
    };
  }
  return { message: error instanceof Error ? error.message : "Database query failed" };
}

export class PostgresQueryBuilder<T = unknown> implements PromiseLike<QueryResponse<T>> {
  private operation: QueryOperation = "select";
  private selectedColumns = "*";
  private filters: Filter[] = [];
  private orderClause: OrderClause | null = null;
  private limitCount: number | null = null;
  private payload: Record<string, unknown>[] = [];
  private onConflictColumns: string[] = [];

  constructor(private readonly table: string) {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Unsupported table: ${table}`);
    }
  }

  select(columns = "*"): this {
    this.selectedColumns = columns;
    if (this.operation !== "insert" && this.operation !== "update" && this.operation !== "upsert") {
      this.operation = "select";
    }
    return this;
  }

  insert(values: unknown): this {
    this.operation = "insert";
    this.payload = normalizeRows(values);
    return this;
  }

  update(values: unknown): this {
    this.operation = "update";
    this.payload = normalizeRows(values);
    return this;
  }

  upsert(values: unknown, options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.payload = normalizeRows(values);
    this.onConflictColumns = options?.onConflict
      ? options.onConflict.split(",").map((column) => column.trim()).filter(Boolean)
      : ["id"];
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: "=", value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: ">=", value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: "<=", value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: "<", value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: ">", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderClause = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  async single(): Promise<QueryResponse<T>> {
    const response = await this.execute();
    if (response.error) return response as QueryResponse<T>;
    const rows = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    if (rows.length !== 1) {
      return {
        data: null,
        error: {
          message: "JSON object requested, multiple (or no) rows returned",
          code: "PGRST116",
        },
      };
    }
    return { data: rows[0] as T, error: null };
  }

  async maybeSingle(): Promise<QueryResponse<T>> {
    const response = await this.execute();
    if (response.error) return response as QueryResponse<T>;
    const rows = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    if (rows.length === 0) return { data: null, error: null };
    if (rows.length > 1) {
      return {
        data: null,
        error: {
          message: "JSON object requested, multiple rows returned",
          code: "PGRST116",
        },
      };
    }
    return { data: rows[0] as T, error: null };
  }

  then<TResult1 = QueryResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhere(params: unknown[]): string {
    if (!this.filters.length) return "";
    const clauses = this.filters.map((filter) => {
      params.push(filter.value);
      return `${quoteIdentifier(filter.column)} ${filter.op} $${params.length}`;
    });
    return ` where ${clauses.join(" and ")}`;
  }

  private buildOrder(): string {
    if (!this.orderClause) return "";
    return ` order by ${quoteIdentifier(this.orderClause.column)} ${this.orderClause.ascending ? "asc" : "desc"}`;
  }

  private buildLimit(params: unknown[]): string {
    if (this.limitCount === null) return "";
    params.push(this.limitCount);
    return ` limit $${params.length}`;
  }

  private async execute(): Promise<QueryResponse<T>> {
    try {
      switch (this.operation) {
        case "insert":
          return await this.executeInsert();
        case "update":
          return await this.executeUpdate();
        case "upsert":
          return await this.executeUpsert();
        case "select":
        default:
          return await this.executeSelect();
      }
    } catch (error) {
      return { data: null, error: toSupabaseError(error) };
    }
  }

  private async executeSelect(): Promise<QueryResponse<T>> {
    const params: unknown[] = [];
    const sql =
      `select ${parseColumns(this.selectedColumns)} from ${quoteIdentifier(this.table)}` +
      this.buildWhere(params) +
      this.buildOrder() +
      this.buildLimit(params);
    const result = await dbQuery(sql, params);
    return { data: result.rows as T, error: null };
  }

  private async executeInsert(): Promise<QueryResponse<T>> {
    if (!this.payload.length) return { data: [] as T, error: null };
    const columns = Array.from(new Set(this.payload.flatMap((row) => Object.keys(row))));
    const params: unknown[] = [];
    const valuesSql = this.payload
      .map((row) => {
        const placeholders = columns.map((column) => {
          params.push(row[column] ?? null);
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");
    const returning = this.selectedColumns ? ` returning ${parseColumns(this.selectedColumns)}` : "";
    const sql = `insert into ${quoteIdentifier(this.table)} (${columns.map(quoteIdentifier).join(", ")}) values ${valuesSql}${returning}`;
    const result = await dbQuery(sql, params);
    return { data: result.rows as T, error: null };
  }

  private async executeUpdate(): Promise<QueryResponse<T>> {
    const row = this.payload[0];
    if (!row) return { data: null, error: { message: "Missing update payload" } };
    const columns = Object.keys(row);
    if (!columns.length) return { data: null, error: { message: "Missing update columns" } };
    const params: unknown[] = [];
    const setSql = columns.map((column) => {
      params.push(row[column]);
      return `${quoteIdentifier(column)} = $${params.length}`;
    });
    const returning = this.selectedColumns ? ` returning ${parseColumns(this.selectedColumns)}` : "";
    const sql =
      `update ${quoteIdentifier(this.table)} set ${setSql.join(", ")}` +
      this.buildWhere(params) +
      returning;
    const result = await dbQuery(sql, params);
    return { data: result.rows as T, error: null };
  }

  private async executeUpsert(): Promise<QueryResponse<T>> {
    if (!this.payload.length) return { data: [] as T, error: null };
    const columns = Array.from(new Set(this.payload.flatMap((row) => Object.keys(row))));
    const conflictColumns = this.onConflictColumns.length ? this.onConflictColumns : ["id"];
    const params: unknown[] = [];
    const valuesSql = this.payload
      .map((row) => {
        const placeholders = columns.map((column) => {
          params.push(row[column] ?? null);
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");
    const updatableColumns = columns.filter((column) => !conflictColumns.includes(column));
    const updateSql = updatableColumns.length
      ? `do update set ${updatableColumns
          .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
          .join(", ")}`
      : "do nothing";
    const returning = this.selectedColumns ? ` returning ${parseColumns(this.selectedColumns)}` : "";
    const sql =
      `insert into ${quoteIdentifier(this.table)} (${columns.map(quoteIdentifier).join(", ")}) values ${valuesSql}` +
      ` on conflict (${conflictColumns.map(quoteIdentifier).join(", ")}) ${updateSql}${returning}`;
    const result = await dbQuery(sql, params);
    return { data: result.rows as T, error: null };
  }
}

export function createPostgresAdminClient() {
  return {
    from<T = unknown>(table: string) {
      return new PostgresQueryBuilder<T>(table);
    },
    auth: {
      async getUser(token: string): Promise<{
        data: { user: AppUser | null };
        error: SupabaseLikeError | null;
      }> {
        const user = await getUserFromToken(token);
        if (!user) {
          return { data: { user: null }, error: { message: "Unauthorized" } };
        }
        return { data: { user }, error: null };
      },
      admin: {
        async listUsers(options?: { page?: number; perPage?: number }): Promise<{
          data: { users: AppUser[] };
          error: SupabaseLikeError | null;
        }> {
          const page = Math.max(1, Number(options?.page || 1));
          const perPage = Math.min(1000, Math.max(1, Number(options?.perPage || 50)));
          const offset = (page - 1) * perPage;
          const result = await dbQuery(
            `
              select id, email, password_hash, user_metadata, created_at, updated_at, email_confirmed_at
              from users
              order by created_at desc
              limit $1 offset $2
            `,
            [perPage, offset]
          );
          return {
            data: {
              users: result.rows.map((row) => userFromRow(row as Parameters<typeof userFromRow>[0])),
            },
            error: null,
          };
        },
        async getUserById(userId: string): Promise<{
          data: { user: AppUser | null };
          error: SupabaseLikeError | null;
        }> {
          const user = await getUserById(userId);
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: "User not found" } };
        },
      },
    },
  };
}
