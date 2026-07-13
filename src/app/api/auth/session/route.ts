import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getAdminRequestUsername,
  getAdminUserLessonFilter,
  isAdminRequest,
} from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);

  return NextResponse.json({
    authenticated: isAdminRequest(cookieStore),
    lessonFilter: getAdminUserLessonFilter(username),
    username,
  });
}
