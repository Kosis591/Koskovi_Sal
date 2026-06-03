import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const force = process.argv.includes("--force");

loadEnvFile(".env.local");
loadEnvFile(".env");

const databasePath = process.env.DATABASE_PATH?.trim();

if (!databasePath) {
  console.error("Chybi DATABASE_PATH. Priklad: DATABASE_PATH=/var/lib/koskovi-sal/koskovi.sqlite");
  process.exit(1);
}

const dataDir = path.join(projectRoot, "data");

if (!existsSync(dataDir)) {
  console.error(`Slozka data neexistuje: ${dataDir}`);
  process.exit(1);
}

mkdirSync(path.dirname(databasePath), { recursive: true });

const Database = require("better-sqlite3");
const database = new Database(databasePath);

database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS json_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const existingStatement = database.prepare("SELECT key FROM json_store WHERE key = ?");
const upsertStatement = database.prepare(`
  INSERT INTO json_store (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

const dataFiles = readdirSync(dataDir)
  .filter((fileName) => !fileName.endsWith(".tmp"))
  .filter((fileName) => fileName.endsWith(".json") || fileName.endsWith(".jsonl"))
  .sort();

if (dataFiles.length === 0) {
  console.log("Ve slozce data nejsou zadne JSON/JSONL soubory k migraci.");
  process.exit(0);
}

let migratedCount = 0;
let skippedCount = 0;

for (const fileName of dataFiles) {
  const content = readFileSync(path.join(dataDir, fileName), "utf8");
  const existsInSqlite = Boolean(existingStatement.get(fileName));

  if (existsInSqlite && !force) {
    console.log(`Preskakuji ${fileName}, v SQLite uz existuje. Pro prepsani pouzij -- --force.`);
    skippedCount += 1;
    continue;
  }

  upsertStatement.run(fileName, content, new Date().toISOString());
  console.log(`Migrovano: ${fileName}`);
  migratedCount += 1;
}

console.log(`Hotovo. Migrovano: ${migratedCount}, preskoceno: ${skippedCount}.`);
console.log(`SQLite databaze: ${databasePath}`);

function loadEnvFile(fileName) {
  const envPath = path.join(projectRoot, fileName);

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}
