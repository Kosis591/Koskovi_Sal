import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();

  return NextResponse.json({
    authenticated: isAdminRequest(cookieStore),
    username: getAdminRequestUsername(cookieStore),
  });
}
