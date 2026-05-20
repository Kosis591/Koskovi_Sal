import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import {
  getRecurringTrainers,
  recurringTrainingLabels,
  updateRecurringTrainers,
  type RecurringTrainerConfig,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminRequest(await cookies())) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  return NextResponse.json(
    {
      labels: recurringTrainingLabels,
      trainers: await getRecurringTrainers(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(await cookies())) {
    return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    trainers?: RecurringTrainerConfig;
  };
  const trainers = await updateRecurringTrainers(payload.trainers ?? {});

  return NextResponse.json({
    labels: recurringTrainingLabels,
    trainers,
  });
}
