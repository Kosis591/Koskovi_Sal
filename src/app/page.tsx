import { BookingDashboard } from "@/components/booking-dashboard";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import { getBookings, getRecurringCancellationNotices } from "@/lib/bookings-db";
import { formatDateKey } from "@/lib/schedule";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const [initialBookings, initialRecurringCancellations] = await Promise.all([
    getBookings(),
    getRecurringCancellationNotices(),
  ]);

  return (
    <BookingDashboard
      initialBookings={initialBookings}
      initialDate={formatDateKey(new Date())}
      initialRecurringCancellations={initialRecurringCancellations}
      initialSession={{
        authenticated: isAdminRequest(cookieStore),
        username: getAdminRequestUsername(cookieStore),
      }}
    />
  );
}
