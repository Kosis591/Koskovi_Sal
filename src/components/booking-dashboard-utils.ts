import {
  createTimeSlots,
  getOpeningHoursForDate,
  getPendingCleanupBooking,
  hallSettings,
  isSlotBooked,
  isSlotOpen,
  type Booking,
} from "@/lib/schedule";

export const dayFormatter = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
});

export const longDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const monthLabelFormatter = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});

export const cancellationDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});

export const statusStyles = {
  confirmed: "border-[#df5d42] bg-[#fff0eb] text-[#8c2f20]",
  maintenance: "border-[#79818a] bg-[#f1f3f5] text-[#3d4650]",
};

export const statusLabels = {
  confirmed: "Obsazeno",
  maintenance: "Servis",
};

export const cleanupCellStyle =
  "border-[#e1b554] bg-[#fff6d8] text-[#6a4b00]";

const slotFillStyles = {
  cleanup: "bg-[#f0c96b]/45",
  confirmed: "bg-[#fff0eb]",
  maintenance: "bg-[#f1f3f5]",
};

const partialAvailableCellStyle = "bg-white";
const selectedPartialAvailableCellStyle = "selected-period-cell bg-[#eef7fb]";

export type DayAvailabilitySegment =
  | {
      description?: string;
      end: string;
      kind: "free" | "closed" | "cleanup";
      cleanupBookingId?: string;
      start: string;
      title: string;
    }
  | {
      description: string;
      end: string;
      kind: "booked";
      bookingId: string;
      start: string;
      status: Booking["status"];
      title: string;
      trainer?: string;
    };

export type SlotState = {
  booking?: Booking;
  cleanupBooking?: Booking;
  isOpen: boolean;
};

export function getMonthDays(dateKey: string) {
  const base = new Date(`${dateKey}T12:00:00`);
  const firstDay = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const month = firstDay.getMonth();
  const days: Date[] = [];

  for (
    const day = new Date(firstDay);
    day.getMonth() === month;
    day.setDate(day.getDate() + 1)
  ) {
    days.push(new Date(day));
  }

  return days;
}

export function getWeekStartDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);

  return date;
}

export function formatEventCount(count: number) {
  if (count >= 5 || count === 0) {
    return `${count} akcí`;
  }

  return `${count} akce`;
}

export function getSlotStateKey(dateKey: string, time: string) {
  return `${dateKey}|${time}`;
}

export function isCountableEvent(booking: Booking) {
  const normalizedTitle = normalizeText(booking.title);

  if (
    normalizedTitle.includes("uklid") ||
    normalizedTitle.includes("neuklizen")
  ) {
    return false;
  }

  return true;
}

export function isRecurringBookingId(bookingId: string) {
  return bookingId.startsWith("recurring-");
}

export function getDayAvailabilitySegments(
  dateKey: string,
  bookingList: Booking[],
): DayAvailabilitySegment[] {
  const date = new Date(`${dateKey}T12:00:00`);
  const openingHours = getOpeningHoursForDate(date);

  if (!openingHours) {
    return [
      {
        end: "23:59",
        kind: "closed",
        start: "00:00",
        title: "Zavřeno",
      },
    ];
  }

  const segments: DayAvailabilitySegment[] = [];
  const slots = createTimeSlots().filter((time) => isSlotOpen(date, time));

  for (const slot of slots) {
    if (slot < openingHours.start || slot >= openingHours.end) {
      continue;
    }

    const slotEnd = minTime(addMinutes(slot, hallSettings.slotMinutes), openingHours.end);
    const booking = isSlotBooked(bookingList, dateKey, slot);
    const cleanupBooking =
      !booking ? getPendingCleanupBooking(bookingList, dateKey, slot) : undefined;
    const nextSegment: DayAvailabilitySegment = booking
      ? {
          bookingId: booking.id,
          description: formatBookingDescription(booking),
          end: minTime(booking.end, slotEnd),
          kind: "booked",
          start: maxTime(booking.start, slot),
          status: booking.status,
          title: booking.title,
          trainer: booking.trainer,
        }
      : cleanupBooking
        ? {
            cleanupBookingId: cleanupBooking.id,
            description: `Po akci: ${cleanupBooking.title}`,
            end: slotEnd,
            kind: "cleanup",
            start: slot,
            title: "Čeká na úklid",
          }
        : {
            end: slotEnd,
            kind: "free",
            start: slot,
            title: "Volno",
          };

    const previousSegment = segments[segments.length - 1];

    if (canMergeSegments(previousSegment, nextSegment)) {
      previousSegment.end = nextSegment.end;
      continue;
    }

    segments.push(nextSegment);
  }

  return segments.length > 0
    ? segments
    : [
        {
          end: openingHours.end,
          kind: "free",
          start: openingHours.start,
          title: "Volno celý den",
        },
      ];
}

export function getSegmentStyle(segment: DayAvailabilitySegment) {
  if (segment.kind === "cleanup") {
    return cleanupCellStyle;
  }

  if (segment.kind !== "booked") {
    return "";
  }

  return statusStyles[segment.status];
}

export function getBookingCellStyle(
  booking: Booking,
  slotFill: ReturnType<typeof getSlotFill>,
  isSelected: boolean,
) {
  const textStyle =
    booking.status === "confirmed" ? "text-[#8c2f20]" : "text-[#3d4650]";

  return slotFill && slotFill.width < 100
    ? `${
        isSelected ? selectedPartialAvailableCellStyle : partialAvailableCellStyle
      } ${textStyle}`
    : statusStyles[booking.status];
}

export function getCurrentTimeOffset(
  date: Date,
  slotStart: string,
  currentMinutes: number,
) {
  const openingHours = getOpeningHoursForDate(date);

  if (!openingHours) {
    return null;
  }

  const start = timeToMinutes(slotStart);
  const end = start + hallSettings.slotMinutes;
  const dayStart = timeToMinutes(openingHours.start);
  const dayEnd = timeToMinutes(openingHours.end);

  if (currentMinutes < start || currentMinutes >= end) {
    if (currentMinutes < dayStart && start <= dayStart && end > dayStart) {
      return 0;
    }

    if (currentMinutes >= dayEnd && start < dayEnd && end >= dayEnd) {
      return 100;
    }

    return null;
  }

  return ((currentMinutes - start) / hallSettings.slotMinutes) * 100;
}

export function getSlotFill(
  slotStart: string,
  booking?: Booking,
  cleanupBooking?: Booking,
) {
  const source = booking ?? cleanupBooking;

  if (!source) {
    return null;
  }

  const slotStartMinutes = timeToMinutes(slotStart);
  const slotEndMinutes = slotStartMinutes + hallSettings.slotMinutes;
  const sourceStart = booking
    ? timeToMinutes(booking.start)
    : slotStartMinutes;
  const sourceEnd = booking
    ? timeToMinutes(booking.end)
    : slotEndMinutes;
  const overlapStart = Math.max(slotStartMinutes, sourceStart);
  const overlapEnd = Math.min(slotEndMinutes, sourceEnd);
  const width =
    ((overlapEnd - overlapStart) / hallSettings.slotMinutes) * 100;

  if (width <= 0) {
    return null;
  }

  return {
    className: booking
      ? slotFillStyles[booking.status]
      : slotFillStyles.cleanup,
    left: ((overlapStart - slotStartMinutes) / hallSettings.slotMinutes) * 100,
    width,
  };
}

export function getOccupancyNotice(
  selectedBookings: Booking[],
  selectedDate: string,
  now: Date | null,
) {
  if (!now) {
    return null;
  }

  const sortedBookings = [...selectedBookings].sort((first, second) =>
    first.start.localeCompare(second.start),
  );
  const activeBooking = sortedBookings.find((booking) => {
    const start = getDateTime(selectedDate, booking.start);
    const end = getDateTime(selectedDate, booking.end);

    return now >= start && now < end;
  });

  if (activeBooking) {
    return {
      title: `Sál je teď obsazený: ${activeBooking.title}`,
      description: `Uvolní se za ${formatDuration(
        getDateTime(selectedDate, activeBooking.end).getTime() - now.getTime(),
      )} v ${activeBooking.end}.`,
    };
  }

  const nextBooking = sortedBookings.find(
    (booking) => getDateTime(selectedDate, booking.start) > now,
  );

  if (!nextBooking) {
    return null;
  }

  return {
    title: `Obsazenost začíná za ${formatDuration(
      getDateTime(selectedDate, nextBooking.start).getTime() - now.getTime(),
    )}`,
    description: `${nextBooking.title} od ${nextBooking.start} do ${nextBooking.end}.`,
  };
}

export function scrollCurrentTimeIntoView(container: HTMLDivElement | null) {
  const currentSlot = container?.querySelector<HTMLElement>(
    '[data-current-slot="true"]',
  );

  if (!container || !currentSlot) {
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const currentSlotRect = currentSlot.getBoundingClientRect();
  const headerOffset = 84;
  const sideOffset = 180;
  const shouldScrollSideways = container.dataset.calendarView === "month";
  const nextScrollTop =
    container.scrollTop + currentSlotRect.top - containerRect.top - headerOffset;
  const nextScrollLeft =
    container.scrollLeft + currentSlotRect.left - containerRect.left - sideOffset;

  container.scrollTo({
    left: shouldScrollSideways ? Math.max(0, nextScrollLeft) : 0,
    top: Math.max(0, nextScrollTop),
    behavior: "smooth",
  });
}

function formatBookingDescription(booking: Booking) {
  return booking.trainer
    ? `${booking.organizer} · Trenér: ${booking.trainer}`
    : booking.organizer;
}

function canMergeSegments(
  previousSegment: DayAvailabilitySegment | undefined,
  nextSegment: DayAvailabilitySegment,
) {
  if (!previousSegment || previousSegment.kind !== nextSegment.kind) {
    return false;
  }

  if (previousSegment.kind === "booked" && nextSegment.kind === "booked") {
    return (
      previousSegment.title === nextSegment.title &&
      previousSegment.description === nextSegment.description &&
      previousSegment.bookingId === nextSegment.bookingId &&
      previousSegment.status === nextSegment.status
    );
  }

  if (previousSegment.kind === "cleanup" && nextSegment.kind === "cleanup") {
    return (
      previousSegment.title === nextSegment.title &&
      previousSegment.description === nextSegment.description &&
      previousSegment.cleanupBookingId === nextSegment.cleanupBookingId
    );
  }

  return (
    previousSegment.title === nextSegment.title &&
    previousSegment.description === nextSegment.description
  );
}

function getDateTime(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00`);
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

function minTime(left: string, right: string) {
  return timeToMinutes(left) <= timeToMinutes(right) ? left : right;
}

function maxTime(left: string, right: string) {
  return timeToMinutes(left) >= timeToMinutes(right) ? left : right;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
