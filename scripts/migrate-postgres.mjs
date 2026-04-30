import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations = [
  {
    id: "20260430_self_hosted_schema",
    file: path.join(__dirname, "sql", "20260430_self_hosted_schema.sql"),
  },
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[migrate] DATABASE_URL is not configured");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const migration of migrations) {
    const existing = await client.query("select id from schema_migrations where id = $1", [migration.id]);
    if (existing.rowCount) {
      console.log(`[migrate] skipped ${migration.id}`);
      continue;
    }

    const sql = await readFile(migration.file, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [migration.id]);
      await client.query("commit");
      console.log(`[migrate] applied ${migration.id}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
