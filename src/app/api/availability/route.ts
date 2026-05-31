import { NextResponse } from "next/server";
import {
  getBookings,
  getRecurringCancellationNotices,
  getRecurringOverrideNotices,
} from "@/lib/bookings-db";
import { hallSettings } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      source: "database",
      hall: hallSettings,
      bookings: await getBookings(),
      recurringCancellations: await getRecurringCancellationNotices(),
      recurringOverrides: await getRecurringOverrideNotices(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
