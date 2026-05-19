import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAuditLog } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);

  if (!isAdminRequest(cookieStore) || !username) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  const entries = await readAuditLog(100);

  if (username !== "kosis") {
    return NextResponse.json({
      entries: entries.filter(
        (entry) => entry.actor === username && entry.action === "booking.delete",
      ),
    });
  }

  return NextResponse.json({ entries });
}
