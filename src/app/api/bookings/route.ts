import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import { createBooking, getBookings, type BookingInput } from "@/lib/bookings-db";

export async function GET() {
  if (!isAdminRequest(await cookies())) {
    return NextResponse.json({ message: "Neprihlaseno." }, { status: 401 });
  }

  return NextResponse.json({ bookings: await getBookings() });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Neprihlaseno." }, { status: 401 });
  }

  const input = (await request.json()) as BookingInput;

  if (!input.title || !input.date || !input.start || !input.end) {
    return NextResponse.json(
      { message: "Chybi povinne udaje akce." },
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
        message: "V tomto case uz existuje jina akce.",
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
        date: result.booking.date,
        end: result.booking.end,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({ booking: result.booking });
}
