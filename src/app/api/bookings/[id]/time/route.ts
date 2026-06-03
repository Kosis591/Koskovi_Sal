import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import {
  getAdminRequestUsername,
  isAdminRequest,
  isReadOnlyLessonUsername,
} from "@/lib/auth";
import { getBookings, updateBookingTime } from "@/lib/bookings-db";

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
  const payload = (await request.json()) as {
    end?: string;
    start?: string;
  };
  const start = payload.start?.trim();
  const end = payload.end?.trim();

  if (!start || !end || !isTimeValue(start) || !isTimeValue(end)) {
    return NextResponse.json(
      { message: "Vyplň platný čas začátku a konce." },
      { status: 400 },
    );
  }

  if (start >= end) {
    return NextResponse.json(
      { message: "Konec akce musí být později než začátek." },
      { status: 400 },
    );
  }

  const previousBooking = (await getBookings()).find(
    (booking) => booking.id === id,
  );
  const result = await updateBookingTime(id, start, end);

  if (result.notFound) {
    return NextResponse.json(
      { message: "Akce nebyla nalezena." },
      { status: 404 },
    );
  }

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
      action: "booking.update",
      actor,
      bookingId: result.booking.id,
      details: {
        booking: result.booking,
        date: result.booking.date,
        end: result.booking.end,
        previousBooking,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({ booking: result.booking });
}

function isTimeValue(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}
