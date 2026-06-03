import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dataDir = path.join(process.cwd(), "data");

type SqliteDatabase = {
  exec: (source: string) => void;
  prepare: (source: string) => {
    get: (...parameters: unknown[]) => { value?: string } | undefined;
    run: (...parameters: unknown[]) => unknown;
  };
  pragma: (source: string) => unknown;
};

let sqliteDatabase: SqliteDatabase | null = null;

export function isSqliteStorageEnabled() {
  return Boolean(getDatabasePath());
}

export async function ensureDataStorage() {
  if (isSqliteStorageEnabled()) {
    getSqliteDatabase();
    return;
  }

  await mkdir(dataDir, { recursive: true });
}

export async function readDataText(fileName: string) {
  if (isSqliteStorageEnabled()) {
    return readDataTextFromSqlite(fileName);
  }

  return readFile(getDataFilePath(fileName), "utf8");
}

export function readDataTextSync(fileName: string) {
  if (isSqliteStorageEnabled()) {
    return readDataTextFromSqlite(fileName);
  }

  return readFileSync(getDataFilePath(fileName), "utf8");
}

export async function writeDataText(fileName: string, content: string) {
  if (isSqliteStorageEnabled()) {
    writeDataTextToSqlite(fileName, content);
    return;
  }

  await mkdir(dataDir, { recursive: true });

  const temporaryFile = path.join(dataDir, `${fileName}.tmp`);

  await writeFile(temporaryFile, content, "utf8");
  await rename(temporaryFile, getDataFilePath(fileName));
}

export async function appendDataText(fileName: string, content: string) {
  if (isSqliteStorageEnabled()) {
    let currentContent = "";

    try {
      currentContent = readDataTextFromSqlite(fileName);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    writeDataTextToSqlite(fileName, `${currentContent}${content}`);
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(getDataFilePath(fileName), content, { flag: "a" });
}

export async function getDataTextSize(fileName: string) {
  if (isSqliteStorageEnabled()) {
    try {
      return Buffer.byteLength(readDataTextFromSqlite(fileName), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return 0;
      }

      throw error;
    }
  }

  return (await stat(getDataFilePath(fileName))).size;
}

function readDataTextFromSqlite(fileName: string) {
  const row = getSqliteDatabase()
    .prepare("SELECT value FROM json_store WHERE key = ?")
    .get(fileName);

  if (!row?.value) {
    const error = new Error(`Storage key not found: ${fileName}`) as NodeJS.ErrnoException;

    error.code = "ENOENT";
    throw error;
  }

  return row.value;
}

function writeDataTextToSqlite(fileName: string, content: string) {
  getSqliteDatabase()
    .prepare(
      `INSERT INTO json_store (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(fileName, content, new Date().toISOString());
}

function getSqliteDatabase() {
  if (sqliteDatabase) {
    return sqliteDatabase;
  }

  const databasePath = getDatabasePath();

  if (!databasePath) {
    throw new Error("DATABASE_PATH neni nastaveno.");
  }

  mkdirSync(path.dirname(databasePath), { recursive: true });

  const Database = require("better-sqlite3") as new (filename: string) => SqliteDatabase;
  const database = new Database(databasePath);

  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS json_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  sqliteDatabase = database;

  return database;
}

function getDatabasePath() {
  return process.env.DATABASE_PATH?.trim();
}

function getDataFilePath(fileName: string) {
  return path.join(dataDir, fileName);
}
