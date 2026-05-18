import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAuditLog } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Neprihlaseno." }, { status: 401 });
  }

  if (username !== "kosis") {
    return NextResponse.json({ message: "Nedostatecna opravneni." }, { status: 403 });
  }

  return NextResponse.json({ entries: await readAuditLog(100) });
}
