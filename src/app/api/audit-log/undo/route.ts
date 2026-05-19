import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog, readAuditLog, type AuditLogEntry } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import {
  deleteBooking,
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

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  if (actor !== "kosis") {
    return NextResponse.json(
      { message: "Undo je dostupné jen pro uživatele kosis." },
      { status: 403 },
    );
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
