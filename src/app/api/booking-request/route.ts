import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import {
  getAdminRequestUsername,
  isAdminRequest,
  isReadOnlyLessonUsername,
} from "@/lib/auth";
import { createBooking } from "@/lib/bookings-db";
import type { BookingRequest } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json(
      { message: "Pro vytvoření rezervace je nutné přihlášení." },
      { status: 401 },
    );
  }

  if (isReadOnlyLessonUsername(actor)) {
    return NextResponse.json(
      { message: "Tento účet má soustředění pouze pro čtení." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as Partial<BookingRequest>;

  if (!payload.name || !payload.date || !payload.start || !payload.end) {
    return NextResponse.json(
      { message: "Chybí povinné údaje rezervace." },
      { status: 400 },
    );
  }

  if (payload.bookingKind === "individual-lesson" && !payload.trainer) {
    return NextResponse.json(
      { message: "Pro soustředění vyber trenéra." },
      { status: 400 },
    );
  }

  const isIndividualLesson = payload.bookingKind === "individual-lesson";

  if (!isIndividualLesson && !isHallEventType(payload.eventType)) {
    return NextResponse.json(
      { message: "Vyber platný typ rezervace." },
      { status: 400 },
    );
  }

  const trainer =
    isIndividualLesson || payload.eventType === "seminar"
      ? payload.trainer
      : undefined;
  const hallEventType =
    !isIndividualLesson && isHallEventType(payload.eventType)
      ? payload.eventType
      : undefined;

  const result = await createBooking({
    title: payload.name,
    organizer: payload.name,
    date: payload.date,
    start: payload.start,
    end: payload.end,
    cleanupRequired: Boolean(payload.cleanupRequired),
    bookingKind:
      isIndividualLesson ? "individual-lesson" : "hall",
    createdBy: actor,
    eventType: hallEventType,
    status: payload.eventType === "obsazeno" ? "maintenance" : "confirmed",
    trainer,
    note: [trainer ? `Trenér: ${trainer}` : null, payload.note]
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
        booking: result.booking,
        date: result.booking.date,
        end: result.booking.end,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json(
    {
      status: "accepted",
      source: "database",
      message: "Rezervace je uložena v databázi.",
      booking: result.booking,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function isHallEventType(
  eventType: string | undefined,
): eventType is "soustredeni" | "seminar" | "obsazeno" {
  return ["soustredeni", "seminar", "obsazeno"].includes(eventType ?? "");
}
