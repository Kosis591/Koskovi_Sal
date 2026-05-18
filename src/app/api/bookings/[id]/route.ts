import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import {
  deleteBooking,
  getBookings,
  updateBooking,
  type BookingInput,
} from "@/lib/bookings-db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Neprihlaseno." }, { status: 401 });
  }

  const { id } = await context.params;
  const input = (await request.json()) as BookingInput;

  if (!input.title || !input.date || !input.start || !input.end) {
    return NextResponse.json(
      { message: "Chybi povinne udaje akce." },
      { status: 400 },
    );
  }

  const result = await updateBooking(id, {
    ...input,
    updatedBy: actor,
  });

  if (result.notFound) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
  }

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
      action: "booking.update",
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Neprihlaseno." }, { status: 401 });
  }

  const { id } = await context.params;
  const existingBooking = (await getBookings()).find((booking) => booking.id === id);
  const deleted = await deleteBooking(id);

  if (!deleted) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
  }

  await appendAuditLog({
    action: "booking.delete",
    actor,
    bookingId: id,
    details: existingBooking
      ? {
          date: existingBooking.date,
          end: existingBooking.end,
          start: existingBooking.start,
          title: existingBooking.title,
        }
      : undefined,
  });

  return NextResponse.json({ deleted: true });
}
