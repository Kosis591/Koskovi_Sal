import { BookingDashboard } from "@/components/booking-dashboard";
import {
  getAdminRequestUsername,
  getAdminUserLessonFilter,
  isAdminRequest,
} from "@/lib/auth";
import {
  getBookings,
  getRecurringCancellationNotices,
  getRecurringOverrideNotices,
} from "@/lib/bookings-db";
import { formatDateKey } from "@/lib/schedule";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SoustredeniPage() {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);
  const [
    initialBookings,
    initialRecurringCancellations,
    initialRecurringOverrides,
  ] = await Promise.all([
    getBookings(),
    getRecurringCancellationNotices(),
    getRecurringOverrideNotices(),
  ]);

  return (
    <BookingDashboard
      initialAppMode="lessons"
      initialBookings={initialBookings}
      initialDate={formatDateKey(new Date())}
      initialRecurringCancellations={initialRecurringCancellations}
      initialRecurringOverrides={initialRecurringOverrides}
      initialSession={{
        authenticated: isAdminRequest(cookieStore),
        lessonFilter: getAdminUserLessonFilter(username),
        username,
      }}
    />
  );
}
