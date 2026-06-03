import {
  appendDataText,
  ensureDataStorage,
  getDataTextSize,
  readDataText,
  writeDataText,
} from "@/lib/runtime-storage";

const auditLogFile = "audit-log.jsonl";
const maxAuditLogBytes = 100 * 1024 * 1024;
const targetTrimBytes = 75 * 1024 * 1024;

export type AuditAction =
  | "booking.clean"
  | "booking.create"
  | "booking.delete"
  | "booking.rename"
  | "booking.undo"
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

  await ensureDataStorage();
  await trimAuditLogIfNeeded(Buffer.byteLength(nextEntry));
  await appendDataText(auditLogFile, nextEntry);
}

export async function readAuditLog(limit = 100) {
  try {
    const content = await readDataText(auditLogFile);

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
    const size = await getDataTextSize(auditLogFile);

    if (size + nextEntryBytes <= maxAuditLogBytes) {
      return;
    }

    const content = Buffer.from(await readDataText(auditLogFile));
    const trimmed = content.subarray(Math.max(0, content.length - targetTrimBytes));
    const firstNewline = trimmed.indexOf(10);
    const safeTrimmed =
      firstNewline === -1 ? trimmed : trimmed.subarray(firstNewline + 1);

    await writeDataText(auditLogFile, safeTrimmed.toString("utf8"));
  } catch {
    return;
  }
}
