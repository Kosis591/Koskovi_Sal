import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookie,
  createAdminSession,
  isAdminCredentials,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { password, username } = (await request.json()) as {
    password?: string;
    username?: string;
  };

  if (!username || !password || !isAdminCredentials(username, password)) {
    return NextResponse.json(
      { message: "Nesprávné přihlašovací údaje." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(adminSessionCookie, createAdminSession(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
