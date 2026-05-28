import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestUsername, verifyAdminPassword } from "@/lib/auth";
import { upsertAdminUserPassword } from "@/lib/admin-users-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore);

  if (!actor) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!payload.newPassword || payload.newPassword.length < 8) {
    return NextResponse.json(
      { message: "Nové heslo musí mít alespoň 8 znaků." },
      { status: 400 },
    );
  }

  if (
    actor !== "kosis" &&
    (!payload.currentPassword ||
      !verifyAdminPassword(actor, payload.currentPassword))
  ) {
    return NextResponse.json(
      { message: "Současné heslo není správné." },
      { status: 403 },
    );
  }

  await upsertAdminUserPassword({
    actor,
    password: payload.newPassword,
    username: actor,
  });

  return NextResponse.json({ message: "Heslo je změněné." });
}
