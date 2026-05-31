import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getAdminRequestUsername,
  isAdminRequest,
  isReadOnlyLessonUsername,
} from "@/lib/auth";
import {
  addRecurringHoliday,
  deleteRecurringHoliday,
  getRecurringHolidays,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  return NextResponse.json(
    { holidays: await getRecurringHolidays() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore);

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  if (isReadOnlyLessonUsername(actor)) {
    return NextResponse.json(
      { message: "Tento účet nemá přístup ke správě akcí." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as {
    end?: string;
    label?: string;
    start?: string;
  };

  if (
    !isDateKey(payload.start) ||
    !isDateKey(payload.end) ||
    payload.start > payload.end
  ) {
    return NextResponse.json(
      { message: "Vyber platné období prázdnin." },
      { status: 400 },
    );
  }

  const holiday = await addRecurringHoliday({
    end: payload.end,
    label: payload.label ?? "",
    start: payload.start,
  });

  return NextResponse.json({ holiday });
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const actor = getAdminRequestUsername(cookieStore);

  if (!isAdminRequest(cookieStore)) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  if (isReadOnlyLessonUsername(actor)) {
    return NextResponse.json(
      { message: "Tento účet nemá přístup ke správě akcí." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as { id?: string };

  if (!payload.id) {
    return NextResponse.json({ message: "Chybí období." }, { status: 400 });
  }

  await deleteRecurringHoliday(payload.id);

  return NextResponse.json({ deleted: true });
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
