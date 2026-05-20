import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { updateBookingTrainer } from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!isAdminRequest(await cookies())) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  const { id } = await context.params;
  const payload = (await request.json()) as { trainer?: string };
  const result = await updateBookingTrainer(id, payload.trainer ?? "");

  if (result.notFound) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
  }

  return NextResponse.json(
    { booking: result.booking },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
