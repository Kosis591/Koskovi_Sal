import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getAdminRequestUsername,
  getAdminUserLessonFilter,
  isAdminRequest,
  type LessonFilter,
} from "@/lib/auth";
import {
  getImportedIndividualLessons,
  replaceImportedIndividualLessons,
  type ImportedIndividualLesson,
} from "@/lib/individual-lessons-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Je nutné přihlášení." }, { status: 401 });
  }

  const username = getAdminRequestUsername(cookieStore);
  const lessonFilter = getAdminUserLessonFilter(username);
  const lessons = await getImportedIndividualLessons();

  return NextResponse.json(
    { lessons: filterLessons(lessons, lessonFilter) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);

  if (username !== "kosis") {
    return NextResponse.json(
      { message: "Import rozpisu soustředění může ukládat jen kosis." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as {
    lessons?: ImportedIndividualLesson[];
  };
  const lessons = await replaceImportedIndividualLessons(payload.lessons ?? []);

  return NextResponse.json(
    { lessons, message: "Rozpis soustředění je uložený." },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function filterLessons(
  lessons: ImportedIndividualLesson[],
  lessonFilter: LessonFilter,
) {
  if (lessonFilter.type === "all" || !lessonFilter.value.trim()) {
    return lessons;
  }

  const query = normalize(lessonFilter.value);

  return lessons.filter((lesson) => {
    if (lessonFilter.type === "trainer") {
      return normalize(lesson.trainer).includes(query);
    }

    return normalize(lesson.name).includes(query);
  });
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
