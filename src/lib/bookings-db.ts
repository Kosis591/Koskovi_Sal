import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  bookings as seedBookings,
  type Booking,
} from "@/lib/schedule";

const dataDir = path.join(process.cwd(), "data");
const bookingsFile = path.join(dataDir, "bookings.json");
const temporaryBookingsFile = path.join(dataDir, "bookings.json.tmp");
const recurringHorizonDays = 28;
const latBaseWeekMonday = "2026-05-18";
let databaseQueue = Promise.resolve();

export type BookingInput = Omit<Booking, "id">;

export async function getBookings() {
  return readBookings();
}

export async function createBooking(input: BookingInput) {
  return withDatabaseLock(async () => {
    const bookings = removeRecurringConflicts(await readBookings(), input);
    const conflict = findBookingConflict(bookings, input);

    if (conflict) {
      return { booking: null, conflict };
    }

    const booking: Booking = {
      ...input,
      createdAt: input.createdAt ?? new Date().toISOString(),
      id: crypto.randomUUID(),
    };

    await writeBookings([...bookings, booking]);

    return { booking, conflict: null };
  });
}

export async function updateBooking(id: string, input: BookingInput) {
  return withDatabaseLock(async () => {
    const bookings = removeRecurringConflicts(await readBookings(), input, id);
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, conflict: null, notFound: true };
    }

    const conflict = findBookingConflict(bookings, input, id);

    if (conflict) {
      return { booking: null, conflict, notFound: false };
    }

    const previousBooking = bookings[index];
    const booking: Booking = {
      ...previousBooking,
      ...input,
      createdAt: previousBooking.createdAt,
      createdBy: previousBooking.createdBy,
      id,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };

    bookings[index] = booking;
    await writeBookings(bookings);

    return { booking, conflict: null, notFound: false };
  });
}

export async function deleteBooking(id: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const nextBookings = bookings.filter((booking) => booking.id !== id);

    if (nextBookings.length === bookings.length) {
      return false;
    }

    await writeBookings(nextBookings);
    return true;
  });
}

export async function markBookingCleaned(id: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, notFound: true };
    }

    const booking = bookings[index];

    if (!booking.cleanupRequired) {
      return { booking, notFound: false };
    }

    const updatedBooking = {
      ...booking,
      cleanedAt: new Date().toISOString(),
      cleanedBy: "public",
    };

    bookings[index] = updatedBooking;
    await writeBookings(bookings);

    return { booking: updatedBooking, notFound: false };
  });
}

async function readBookings() {
  await ensureDatabase();

  const content = await readFile(bookingsFile, "utf-8");
  const bookings = normalizeBookings(JSON.parse(content) as Booking[]);

  if (content !== serializeBookings(bookings)) {
    await writeBookings(bookings);
  }

  return bookings;
}

async function writeBookings(bookings: Booking[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(temporaryBookingsFile, serializeBookings(bookings), "utf-8");
  await rename(temporaryBookingsFile, bookingsFile);
}

async function ensureDatabase() {
  try {
    await readFile(bookingsFile, "utf-8");
  } catch {
    await writeBookings(seedBookings);
  }
}

function sortBookings(bookings: Booking[]) {
  return [...bookings].sort((left, right) =>
    `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
  );
}

function normalizeBookings(bookings: Booking[]) {
  const uniqueBookings = new Map<string, Booking>();

  for (const booking of addRecurringBookings(removePastBookings(bookings))) {
    uniqueBookings.set(booking.id, booking);
  }

  return sortBookings([...uniqueBookings.values()]);
}

function addRecurringBookings(bookings: Booking[]) {
  const recurringBookings = createRecurringBookings();
  const protectedBookings = bookings.filter(
    (booking) => !isOutOfHorizonRecurringBooking(booking),
  );
  const nextBookings = [...protectedBookings];

  for (const recurringBooking of recurringBookings) {
    const existingIndex = nextBookings.findIndex(
      (booking) => booking.id === recurringBooking.id,
    );

    if (existingIndex !== -1) {
      nextBookings[existingIndex] = recurringBooking;
      continue;
    }

    const conflict = findBookingConflict(
      nextBookings.filter((booking) => !isRecurringBooking(booking)),
      recurringBooking,
    );

    if (!conflict) {
      nextBookings.push(recurringBooking);
    }
  }

  return nextBookings;
}

export async function refreshRecurringBookings() {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    await writeBookings(bookings);

    return {
      bookings,
      recurringCount: bookings.filter(isRecurringBooking).length,
    };
  });
}

function createRecurringBookings() {
  const today = dateKeyToUtcDate(getTodayPragueDateKey());
  const bookings: Booking[] = [];

  for (let offset = 0; offset <= recurringHorizonDays; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    const day = date.getUTCDay();
    const dateKey = formatUtcDateKey(date);

    if (day === 2) {
      bookings.push({
        id: `recurring-practise-${dateKey}`,
        title: "Practise",
        organizer: "Koskovi",
        date: dateKey,
        start: "17:30",
        end: "19:30",
        status: "confirmed",
        note: "Pravidelna uterni akce",
      });
    }

    if (day === 4) {
      const danceStyle = getAlternatingDanceStyle(dateKey);

      bookings.push(
        {
          id: `recurring-pohybovka-${dateKey}`,
          title: "Pohybovka",
          organizer: "Koskovi",
          date: dateKey,
          start: "17:15",
          end: "18:00",
          status: "confirmed",
          note: "Pravidelna ctvrtecni akce",
        },
        {
          id: `recurring-spolecna-${dateKey}`,
          title: `Spolecna ${danceStyle}`,
          organizer: "Koskovi",
          date: dateKey,
          start: "18:00",
          end: "19:30",
          status: "confirmed",
          note: "LAT a STT se stridaji po tydnu",
        },
      );
    }
  }

  return bookings;
}

function findBookingConflict(
  bookings: Booking[],
  input: BookingInput,
  ignoredId?: string,
) {
  return bookings.find((booking) => {
    if (booking.id === ignoredId || booking.date !== input.date) {
      return false;
    }

    return timeRangesOverlap(
      input.start,
      input.end,
      booking.start,
      booking.end,
    );
  });
}

function removeRecurringConflicts(
  bookings: Booking[],
  input: BookingInput,
  ignoredId?: string,
) {
  if (input.status !== "maintenance") {
    return bookings;
  }

  return bookings.filter((booking) => {
    if (booking.id === ignoredId || !isRecurringBooking(booking)) {
      return true;
    }

    if (booking.date !== input.date) {
      return true;
    }

    return !timeRangesOverlap(input.start, input.end, booking.start, booking.end);
  });
}

function isRecurringBooking(booking: Booking) {
  return booking.id.startsWith("recurring-");
}

function isOutOfHorizonRecurringBooking(booking: Booking) {
  if (!isRecurringBooking(booking)) {
    return false;
  }

  const today = dateKeyToUtcDate(getTodayPragueDateKey());
  const lastHorizonDate = new Date(today);
  lastHorizonDate.setUTCDate(today.getUTCDate() + recurringHorizonDays);

  return dateKeyToUtcDate(booking.date) > lastHorizonDate;
}

function timeRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function removePastBookings(bookings: Booking[]) {
  const today = getTodayPragueDateKey();

  return bookings.filter(
    (booking) =>
      booking.date >= today ||
      (Boolean(booking.cleanupRequired) && !booking.cleanedAt),
  );
}

function serializeBookings(bookings: Booking[]) {
  return `${JSON.stringify(normalizeBookings(bookings), null, 2)}\n`;
}

function getTodayPragueDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getAlternatingDanceStyle(dateKey: string) {
  const baseDate = dateKeyToUtcDate(latBaseWeekMonday);
  const targetDate = dateKeyToUtcDate(dateKey);
  const weekOffset = Math.floor(
    (targetDate.getTime() - baseDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  return weekOffset % 2 === 0 ? "LAT" : "STT";
}

function dateKeyToUtcDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function withDatabaseLock<T>(operation: () => Promise<T>) {
  const nextOperation = databaseQueue.then(operation, operation);

  databaseQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}
