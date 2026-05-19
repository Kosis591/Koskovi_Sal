import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import { isValidOptionalEmail, isValidPhone } from "@/lib/booking-validation";
import { createBooking } from "@/lib/bookings-db";
import type { BookingRequest } from "@/lib/schedule";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json(
      { message: "Pro vytvoření rezervace je nutné přihlášení." },
      { status: 401 },
    );
  }

  const payload = (await request.json()) as Partial<BookingRequest>;

  if (!payload.name || !payload.phone || !payload.date || !payload.start || !payload.end) {
    return NextResponse.json(
      { message: "Chybí povinné údaje rezervace." },
      { status: 400 },
    );
  }

  if (!isValidPhone(payload.phone)) {
    return NextResponse.json(
      { message: "Telefon musí být ve správném tvaru." },
      { status: 400 },
    );
  }

  if (!isValidOptionalEmail(payload.email)) {
    return NextResponse.json(
      { message: "E-mail musí být ve správném tvaru." },
      { status: 400 },
    );
  }

  const result = await createBooking({
    title: payload.name,
    organizer: payload.name,
    date: payload.date,
    start: payload.start,
    end: payload.end,
    cleanupRequired: Boolean(payload.cleanupRequired),
    createdBy: actor,
    status: payload.eventType === "blokace" ? "maintenance" : "confirmed",
    note: [
      `Telefon: ${payload.phone}`,
      payload.email ? `E-mail: ${payload.email}` : null,
      payload.trainer ? `Trenér: ${payload.trainer}` : null,
      payload.note,
    ]
      .filter(Boolean)
      .join("\n"),
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
        date: result.booking.date,
        end: result.booking.end,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({
    status: "accepted",
    source: "database",
    message: "Rezervace je uložena v databázi.",
    booking: result.booking,
  });
}
