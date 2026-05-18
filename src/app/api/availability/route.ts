import { NextResponse } from "next/server";
import { getBookings } from "@/lib/bookings-db";
import { hallSettings } from "@/lib/schedule";

export async function GET() {
  return NextResponse.json({
    source: "database",
    hall: hallSettings,
    bookings: await getBookings(),
  });
}
