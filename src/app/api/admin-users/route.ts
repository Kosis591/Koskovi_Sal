import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestUsername, sanitizeLessonFilter } from "@/lib/auth";
import {
  getAdminUsers,
  upsertAdminUserLessonFilter,
  upsertAdminUserPassword,
} from "@/lib/admin-users-db";

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
    lessonFilter?: {
      type?: "all" | "dancer" | "trainer";
      value?: string;
    };
    password?: string;
    username?: string;
  };
  const username = payload.username?.trim();

  if (!username) {
    return NextResponse.json(
      { message: "Zadej uživatele." },
      { status: 400 },
    );
  }

  if (payload.password !== undefined) {
    if (payload.password.length < 8) {
      return NextResponse.json(
        { message: "Heslo musí mít alespoň 8 znaků." },
        { status: 400 },
      );
    }

    const user = await upsertAdminUserPassword({
      actor,
      password: payload.password,
      username,
    });

    if (payload.lessonFilter) {
      await upsertAdminUserLessonFilter({
        actor,
        lessonFilter: sanitizeLessonFilter(payload.lessonFilter),
        username,
      });
    }

    return NextResponse.json({ message: "Uživatel je uložený.", user });
  }

  try {
    const user = await upsertAdminUserLessonFilter({
      actor,
      lessonFilter: sanitizeLessonFilter(payload.lessonFilter),
      username,
    });

    return NextResponse.json({ message: "Filtr soustředění je uložený.", user });
  } catch {
    return NextResponse.json(
      { message: "Nejdřív uživateli nastav heslo, aby šel filtr uložit." },
      { status: 400 },
    );
  }
}
