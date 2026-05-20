import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { getAdminRequestUsername, isAdminRequest } from "@/lib/auth";
import { reinstateRecurringBooking } from "@/lib/bookings-db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore) ?? "unknown";

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  const { id } = await context.params;

  if (!id.startsWith("recurring-")) {
    return NextResponse.json(
      { message: "Obnovit takto jde jen pravidelný termín." },
      { status: 400 },
    );
  }

  const result = await reinstateRecurringBooking(id);

  if (!result.booking) {
    return NextResponse.json(
      { message: "Pravidelný termín nejde obnovit." },
      { status: 404 },
    );
  }

  await appendAuditLog({
    action: "booking.undo",
    actor,
    bookingId: result.booking.id,
    details: {
      originalAction: "booking.delete",
      title: result.booking.title,
    },
  });

  return NextResponse.json({ booking: result.booking, restored: true });
}
