import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import {
  getAdminRequestUsername,
  isAdminRequest,
  isReadOnlyLessonUsername,
} from "@/lib/auth";
import {
  getBookings,
  updateBookingTitle,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
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

  const { id } = await context.params;
  const payload = (await request.json()) as { title?: string };
  const title = payload.title?.trim();

  if (!title) {
    return NextResponse.json(
      { message: "Vyplň nový název aktivity." },
      { status: 400 },
    );
  }

  const previousBooking = (await getBookings()).find(
    (booking) => booking.id === id,
  );
  const booking = await updateBookingTitle(id, title);

  if (!booking) {
    return NextResponse.json(
      { message: "Akce nebyla nalezena." },
      { status: 404 },
    );
  }

  await appendAuditLog({
    action: "booking.rename",
    actor,
    bookingId: booking.id,
    details: {
      booking,
      date: booking.date,
      end: booking.end,
      previousBooking,
      start: booking.start,
      title: booking.title,
    },
  });

  return NextResponse.json({ booking });
}
