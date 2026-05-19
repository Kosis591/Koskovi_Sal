import { NextRequest, NextResponse } from "next/server";
import { refreshRecurringBookings } from "@/lib/bookings-db";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ message: "Neplatný cron secret." }, { status: 401 });
  }

  const result = await refreshRecurringBookings();

  return NextResponse.json({
    ok: true,
    recurringCount: result.recurringCount,
    bookingCount: result.bookings.length,
  });
}
