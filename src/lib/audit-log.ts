import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const auditLogFile = path.join(dataDir, "audit-log.jsonl");
const maxAuditLogBytes = 100 * 1024 * 1024;
const targetTrimBytes = 75 * 1024 * 1024;

export type AuditAction =
  | "booking.clean"
  | "booking.create"
  | "booking.delete"
  | "booking.update";

export type AuditLogEntry = {
  action: AuditAction;
  actor: string;
  bookingId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
};

export async function appendAuditLog(
  entry: Omit<AuditLogEntry, "timestamp">,
) {
  const nextEntry = `${JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  })}\n`;

  await mkdir(dataDir, { recursive: true });
  await trimAuditLogIfNeeded(Buffer.byteLength(nextEntry));
  await writeFile(auditLogFile, nextEntry, { flag: "a" });
}

export async function readAuditLog(limit = 100) {
  try {
    const content = await readFile(auditLogFile, "utf-8");

    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as AuditLogEntry);
  } catch {
    return [];
  }
}

async function trimAuditLogIfNeeded(nextEntryBytes: number) {
  try {
    const fileStat = await stat(auditLogFile);

    if (fileStat.size + nextEntryBytes <= maxAuditLogBytes) {
      return;
    }

    const content = await readFile(auditLogFile);
    const trimmed = content.subarray(Math.max(0, content.length - targetTrimBytes));
    const firstNewline = trimmed.indexOf(10);
    const safeTrimmed =
      firstNewline === -1 ? trimmed : trimmed.subarray(firstNewline + 1);

    await writeFile(auditLogFile, safeTrimmed);
  } catch {
    return;
  }
}
