import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getImportedIndividualLessons,
  replaceImportedIndividualLessons,
  type ImportedIndividualLesson,
} from "@/lib/individual-lessons-db";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Je nutné přihlášení." }, { status: 401 });
  }

  return NextResponse.json(
    { lessons: await getImportedIndividualLessons() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);

  if (username !== "kosis") {
    return NextResponse.json(
      { message: "Import individuálních lekcí může ukládat jen kosis." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as {
    lessons?: ImportedIndividualLesson[];
  };
  const lessons = await replaceImportedIndividualLessons(payload.lessons ?? []);

  return NextResponse.json(
    { lessons, message: "Rozpis individuálních lekcí je uložený." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
