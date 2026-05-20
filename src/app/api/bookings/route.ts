import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import {
  getAdminRequestUsername,
  isAdminRequest,
  isReadOnlyLessonUsername,
} from "@/lib/auth";
import { createBooking, getBookings, type BookingInput } from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore);

  if (!isAdminRequest(cookieStore) || isReadOnlyLessonUsername(actor)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  return NextResponse.json(
    { bookings: await getBookings() },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  if (isReadOnlyLessonUsername(actor)) {
    return NextResponse.json(
      { message: "Tento účet nemá přístup ke správě akcí." },
      { status: 403 },
    );
  }

  const input = (await request.json()) as BookingInput;

  if (!input.title || !input.date || !input.start || !input.end) {
    return NextResponse.json(
      { message: "Chybí povinné údaje akce." },
      { status: 400 },
    );
  }

  const result = await createBooking({
    ...input,
    createdBy: actor,
  });

  if (result.conflict) {
    return NextResponse.json(
      {
        message: "V tomto čase už existuje jiná akce.",
        conflict: result.conflict,
      },
      { status: 409 },
    );
  }

  if (result.booking) {
    await appendAuditLog({
      action: "booking.create",
      actor,
      bookingId: result.booking.id,
      details: {
        booking: result.booking,
        date: result.booking.date,
        end: result.booking.end,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({ booking: result.booking });
}
