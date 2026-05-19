"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  cancellationDateFormatter,
  dayFormatter,
  formatEventCount,
} from "@/components/booking-dashboard-utils";
import type { RecurringCancellationNotice } from "@/lib/bookings-db";
import { formatDateKey } from "@/lib/schedule";

export function RecurringCancellationPanel({
  cancellations,
}: {
  cancellations: RecurringCancellationNotice[];
}) {
  if (cancellations.length === 0) {
    return (
      <div className="flex h-full min-h-24 items-center rounded-md border border-white/10 bg-white/10 px-4 py-3 text-sm text-[#d7e6ed]">
        Žádný pravidelný trénink není aktuálně zrušený.
      </div>
    );
  }

  return (
    <div className="grid h-full gap-2">
      {cancellations.map((cancellation) => (
        <div
          className="rounded-md border border-[#ffb4a8] bg-[#7f1d1d] px-4 py-3 text-sm text-white shadow-[0_12px_26px_rgba(0,0,0,0.18)]"
          key={cancellation.id}
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle size={17} />
            Zrušený pravidelný trénink
          </p>
          <p className="mt-1 text-[#ffe0dc]">
            {cancellation.title} v datu{" "}
            {cancellationDateFormatter.format(
              new Date(`${cancellation.date}T12:00:00`),
            )}{" "}
            od {cancellation.start} do {cancellation.end}.
          </p>
        </div>
      ))}
    </div>
  );
}

export function MobileCalendarSummary({
  bookingDayCounts,
  days,
  onSelectDate,
  selectedDate,
  viewMode,
}: {
  bookingDayCounts: Map<string, number>;
  days: Date[];
  onSelectDate: (dateKey: string) => void;
  selectedDate: string;
  viewMode: "today" | "week" | "month";
}) {
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (viewMode === "today") {
      return;
    }

    selectedButtonRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedDate, viewMode]);

  if (viewMode === "today") {
    return null;
  }

  return (
    <div className="space-y-4 lg:hidden">
      <div className="overflow-x-auto rounded-lg border border-[#ded6c9] bg-white p-2">
        <div className="flex min-w-max gap-2">
          {days.map((day) => {
            const dateKey = formatDateKey(day);
            const isSelected = dateKey === selectedDate;

            return (
              <button
                className={`min-w-[96px] rounded-md border px-3 py-2 text-left transition ${
                  isSelected
                    ? "selected-period-head border-[#0b4d76] bg-[#0b4d76] text-white shadow-[0_10px_18px_rgba(0,55,88,0.22),inset_0_-4px_0_#8fd7ac]"
                    : "border-[#ded6c9] bg-[#fcfaf6] text-[#132935]"
                }`}
                key={dateKey}
                onClick={() => onSelectDate(dateKey)}
                ref={isSelected ? selectedButtonRef : null}
                type="button"
              >
                <span className="block text-sm font-semibold capitalize">
                  {dayFormatter.format(day)}
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    isSelected ? "text-[#d7e6ed]" : "text-[#66706f]"
                  }`}
                >
                  {formatEventCount(bookingDayCounts.get(dateKey) ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Field({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <label className="field-label">
      <span className="mb-1 flex items-center gap-2">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
