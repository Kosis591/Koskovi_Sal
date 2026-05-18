import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { markBookingCleaned } from "@/lib/bookings-db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await markBookingCleaned(id);

  if (result.notFound) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
  }

  if (result.booking) {
    await appendAuditLog({
      action: "booking.clean",
      actor: "public",
      bookingId: result.booking.id,
      details: {
        date: result.booking.date,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({
    booking: result.booking,
    cleaned: true,
    message: "Sal je oznacen jako uklizeny.",
  });
}
