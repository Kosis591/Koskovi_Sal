import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog, readAuditLog, type AuditLogEntry } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import {
  deleteBooking,
  reinstateRecurringBooking,
  restoreBookingSnapshot,
} from "@/lib/bookings-db";
import type { Booking } from "@/lib/schedule";

type UndoPayload = {
  timestamp?: string;
};

type UndoDetails = {
  booking?: Booking;
  previousBooking?: Booking;
  title?: string;
};

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore);

  if (!isAdminRequest(cookieStore) || !actor) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  const payload = (await request.json()) as UndoPayload;

  if (!payload.timestamp) {
    return NextResponse.json(
      { message: "Chybí identifikace záznamu v logu." },
      { status: 400 },
    );
  }

  const entry = (await readAuditLog(100)).find(
    (item) => item.timestamp === payload.timestamp,
  );

  if (!entry) {
    return NextResponse.json(
      { message: "Záznam logu už není dostupný." },
      { status: 404 },
    );
  }

  if (!canActorUndoEntry(actor, entry)) {
    return NextResponse.json(
      { message: "Tuto operaci nemůžeš vrátit." },
      { status: 403 },
    );
  }

  const undoResult = await undoAuditEntry(entry);

  if (undoResult.status !== 200) {
    return NextResponse.json(
      { message: undoResult.message },
      { status: undoResult.status },
    );
  }

  await appendAuditLog({
    action: "booking.undo",
    actor,
    bookingId: entry.bookingId,
    details: {
      originalAction: entry.action,
      title: undoResult.title,
    },
  });

  return NextResponse.json({
    message: "Operace byla vrácena.",
    undone: true,
  });
}

async function undoAuditEntry(entry: AuditLogEntry) {
  const details = (entry.details ?? {}) as UndoDetails;

  if (entry.action === "booking.create") {
    if (!entry.bookingId) {
      return { message: "V logu chybí ID akce.", status: 400 };
    }

    const deleted = await deleteBooking(entry.bookingId);

    if (!deleted) {
      return { message: "Akce už neexistuje.", status: 404 };
    }

    return { status: 200, title: details.title };
  }

  if (entry.action === "booking.delete") {
    if (!details.booking) {
      return { message: "Tento starší záznam nejde vrátit.", status: 400 };
    }

    if (isPastBookingDate(details.booking)) {
      return {
        message: "Akci už nejde vrátit, protože termín už proběhl.",
        status: 409,
      };
    }

    if (details.booking.id.startsWith("recurring-")) {
      const result = await reinstateRecurringBooking(details.booking.id);

      if (!result.booking) {
        return {
          message: "Pravidelný termín nejde vrátit.",
          status: 404,
        };
      }

      return { status: 200, title: result.booking.title };
    }

    const result = await restoreBookingSnapshot(details.booking);

    if (result.conflict) {
      return {
        message: "Akci nejde vrátit, protože v čase už existuje jiná akce.",
        status: 409,
      };
    }

    return { status: 200, title: details.booking.title };
  }

  if (entry.action === "booking.update" || entry.action === "booking.clean") {
    if (!details.previousBooking) {
      return { message: "Tento starší záznam nejde vrátit.", status: 400 };
    }

    const result = await restoreBookingSnapshot(details.previousBooking);

    if (result.conflict) {
      return {
        message: "Akci nejde vrátit, protože v čase už existuje jiná akce.",
        status: 409,
      };
    }

    return { status: 200, title: details.previousBooking.title };
  }

  return { message: "Tuto operaci nejde vrátit.", status: 400 };
}

function canActorUndoEntry(actor: string, entry: AuditLogEntry) {
  if (actor === "kosis") {
    return true;
  }

  return entry.action === "booking.delete" && entry.actor === actor;
}

function isPastBookingDate(booking: Booking) {
  return booking.date < getTodayPragueDateKey();
}

function getTodayPragueDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Prague",
    year: "numeric",
  }).format(new Date());
}
