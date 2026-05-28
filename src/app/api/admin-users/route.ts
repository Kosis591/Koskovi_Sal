import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestUsername } from "@/lib/auth";
import { getAdminUsers, upsertAdminUserPassword } from "@/lib/admin-users-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = getAdminRequestUsername(await cookies());

  if (actor !== "kosis") {
    return NextResponse.json({ message: "Přístup má jen kosis." }, { status: 403 });
  }

  return NextResponse.json(
    { users: await getAdminUsers() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const actor = getAdminRequestUsername(await cookies());

  if (actor !== "kosis") {
    return NextResponse.json({ message: "Přístup má jen kosis." }, { status: 403 });
  }

  const payload = (await request.json()) as {
    password?: string;
    username?: string;
  };
  const username = payload.username?.trim();

  if (!username || !payload.password || payload.password.length < 8) {
    return NextResponse.json(
      { message: "Zadej uživatele a heslo alespoň 8 znaků." },
      { status: 400 },
    );
  }

  const user = await upsertAdminUserPassword({
    actor,
    password: payload.password,
    username,
  });

  return NextResponse.json({ message: "Uživatel je uložený.", user });
}
