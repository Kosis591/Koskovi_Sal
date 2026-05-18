import { BookingDashboard } from "@/components/booking-dashboard";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import { getBookings } from "@/lib/bookings-db";
import { getTodayInfo } from "@/lib/today-info";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const [initialBookings, initialTodayInfo] = await Promise.all([
    getBookings(),
    getTodayInfo(),
  ]);

  return (
    <BookingDashboard
      initialBookings={initialBookings}
      initialSession={{
        authenticated: isAdminRequest(cookieStore),
        username: getAdminRequestUsername(cookieStore),
      }}
      initialTodayInfo={initialTodayInfo}
    />
  );
}
