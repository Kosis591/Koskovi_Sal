import { NextResponse } from "next/server";
import { getBookings, getRecurringCancellationNotices } from "@/lib/bookings-db";
import { hallSettings } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      source: "database",
      hall: hallSettings,
      bookings: await getBookings(),
      recurringCancellations: await getRecurringCancellationNotices(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
