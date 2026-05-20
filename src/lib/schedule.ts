export type BookingStatus = "confirmed" | "maintenance";
export type BookingKind = "hall" | "individual-lesson";

export type Booking = {
  cleanedAt?: string;
  cleanedBy?: string;
  cleanupRequired?: boolean;
  createdAt?: string;
  createdBy?: string;
  id: string;
  bookingKind?: BookingKind;
  title: string;
  organizer: string;
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  note?: string;
  recurringKey?: string;
  trainer?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type BookingRequest = {
  name: string;
  date: string;
  start: string;
  end: string;
  eventType: string;
  bookingKind?: BookingKind;
  trainer?: string;
  note: string;
  cleanupRequired?: boolean;
};

export const hallSettings = {
  name: "Koskovi",
  location: "Hlavní sál",
  slotMinutes: 30,
  openingHours: [
    { day: 1, label: "Pondeli", start: "10:30", end: "22:00" },
    { day: 2, label: "Utery", start: "10:30", end: "22:00" },
    { day: 3, label: "Streda", start: "10:30", end: "22:00" },
    { day: 4, label: "Ctvrtek", start: "10:30", end: "22:00" },
    { day: 5, label: "Patek", start: "10:30", end: "23:00" },
    { day: 6, label: "Sobota", start: "12:00", end: "22:00" },
    { day: 0, label: "Nedele", start: "14:00", end: "21:00" },
  ],
};

export const trainerOptions = ["Barča", "Jirka", "Marek", "Šárka", "Kamča", "Externí"];

export const bookings: Booking[] = [
  {
    id: "evt-1",
    title: "Kurz latiny",
    organizer: "Studio Move",
    date: "2026-05-18",
    start: "17:00",
    end: "19:00",
    status: "confirmed",
  },
  {
    id: "evt-3",
    title: "Spolecensky vecer",
    organizer: "Mesto",
    date: "2026-05-21",
    start: "18:00",
    end: "22:00",
    status: "confirmed",
  },
  {
    id: "evt-4",
    title: "Úklid a příprava sálu",
    organizer: "Správa sálu",
    date: "2026-05-22",
    start: "08:00",
    end: "10:00",
    status: "maintenance",
  },
  {
    id: "evt-5",
    title: "Workshop salsy",
    organizer: "Salsa Club",
    date: "2026-05-23",
    start: "14:00",
    end: "17:00",
    status: "confirmed",
  },
];

export function createTimeSlots(slotMinutes = hallSettings.slotMinutes) {
  const slots: string[] = [];
  const starts = hallSettings.openingHours.map((hours) =>
    timeToMinutes(hours.start),
  );
  const ends = hallSettings.openingHours.map((hours) => timeToMinutes(hours.end));
  const firstSlot = Math.min(...starts);
  const lastSlot = Math.max(...ends);

  for (
    let minutes = firstSlot;
    minutes < lastSlot;
    minutes += slotMinutes
  ) {
    slots.push(minutesToTime(minutes));
  }

  return slots;
}

export function getWeekDays(startDate = getCurrentWeekStartDate()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function getCurrentWeekStartDate() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);

  return date;
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isSlotBooked(
  bookingList: Booking[],
  date: string,
  time: string,
  slotMinutes = hallSettings.slotMinutes,
) {
  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + slotMinutes;

  return bookingList.find((booking) => {
    const bookingStart = timeToMinutes(booking.start);
    const bookingEnd = timeToMinutes(booking.end);

    return (
      booking.date === date &&
      bookingStart < slotEnd &&
      bookingEnd > slotStart
    );
  });
}

export function getPendingCleanupBooking(
  bookingList: Booking[],
  date: string,
  time: string,
  slotMinutes = hallSettings.slotMinutes,
) {
  const hasRealBooking = isSlotBooked(bookingList, date, time, slotMinutes);

  if (hasRealBooking) {
    return undefined;
  }

  return bookingList.find((booking) => {
    return isCleanupSlot(booking, date, time, bookingList);
  });
}

export function isCleanupSlot(
  booking: Booking,
  date: string,
  time: string,
  bookingList: Booking[] = [],
) {
  const slotDateTime = getDateTimeValue(date, time);
  const cleanupStart = getDateTimeValue(booking.date, booking.end);
  const cleanupEnd = getCleanupEndDateTime(booking, bookingList);

  return (
    Boolean(booking.cleanupRequired) &&
    !booking.cleanedAt &&
    slotDateTime >= cleanupStart &&
    (cleanupEnd === null || slotDateTime < cleanupEnd)
  );
}

export function getEffectiveBookingEnd(
  booking: Booking,
  bookingList: Booking[] = [],
) {
  if (!booking.cleanupRequired || booking.cleanedAt) {
    return booking.end;
  }

  const date = new Date(`${booking.date}T12:00:00`);
  const openingHours = getOpeningHoursForDate(date);
  const nextBookingStart = getCleanupEndDateTime(booking, bookingList);

  if (
    nextBookingStart &&
    formatDateKey(nextBookingStart) === booking.date &&
    (!openingHours || minutesToTime(nextBookingStart.getHours() * 60 + nextBookingStart.getMinutes()) <= openingHours.end)
  ) {
    return minutesToTime(
      nextBookingStart.getHours() * 60 + nextBookingStart.getMinutes(),
    );
  }

  return openingHours?.end ?? booking.end;
}

function getCleanupEndDateTime(booking: Booking, bookingList: Booking[]) {
  const cleanupStart = getDateTimeValue(booking.date, booking.end);
  const nextBooking = bookingList
    .filter((candidate) => {
      if (candidate.id === booking.id) {
        return false;
      }

      return getDateTimeValue(candidate.date, candidate.start) >= cleanupStart;
    })
    .sort(
      (first, second) =>
        getDateTimeValue(first.date, first.start).getTime() -
        getDateTimeValue(second.date, second.start).getTime(),
    )[0];

  return nextBooking
    ? getDateTimeValue(nextBooking.date, nextBooking.start)
    : null;
}

function getDateTimeValue(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export function getOpeningHoursForDate(date: Date) {
  return hallSettings.openingHours.find((hours) => hours.day === date.getDay());
}

export function isSlotOpen(date: Date, time: string) {
  const hours = getOpeningHoursForDate(date);

  if (!hours) {
    return false;
  }

  const slot = timeToMinutes(time);
  return slot >= timeToMinutes(hours.start) && slot < timeToMinutes(hours.end);
}

export function formatOpeningHoursSummary() {
  return "Po-Ct 10:30-22, Pa 10:30-23, So 12-22, Ne 14-21";
}

export function getOpeningHoursGroups() {
  return [
    { days: "Pondeli - ctvrtek", hours: "10:30-22:00" },
    { days: "Patek", hours: "10:30-23:00" },
    { days: "Sobota", hours: "12:00-22:00" },
    { days: "Nedele", hours: "14:00-21:00" },
  ];
}

export function formatOpeningHoursForDate(date: Date) {
  const hours = getOpeningHoursForDate(date);

  if (!hours) {
    return "zavreno";
  }

  return `${hours.start}-${hours.end}`;
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
