import { spawn } from "node:child_process";
import path from "node:path";

const migrationScript = path.resolve(process.cwd(), "scripts/migrate-postgres.mjs");
const child = spawn(process.execPath, [migrationScript], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
