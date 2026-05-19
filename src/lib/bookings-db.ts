import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  bookings as seedBookings,
  type Booking,
} from "@/lib/schedule";

const dataDir = path.join(process.cwd(), "data");
const bookingsFile = path.join(dataDir, "bookings.json");
const recurringCancellationsFile = path.join(dataDir, "recurring-cancellations.json");
const recurringOverridesFile = path.join(dataDir, "recurring-overrides.json");
const recurringTrainersFile = path.join(dataDir, "recurring-trainers.json");
const temporaryBookingsFile = path.join(dataDir, "bookings.json.tmp");
const temporaryRecurringCancellationsFile = path.join(
  dataDir,
  "recurring-cancellations.json.tmp",
);
const temporaryRecurringOverridesFile = path.join(
  dataDir,
  "recurring-overrides.json.tmp",
);
const temporaryRecurringTrainersFile = path.join(
  dataDir,
  "recurring-trainers.json.tmp",
);
const recurringHorizonDays = 28;
const latBaseWeekMonday = "2026-05-18";
let databaseQueue = Promise.resolve();

export type BookingInput = Omit<Booking, "id">;

export type RecurringTrainingKey =
  | "deti"
  | "juniori-utery"
  | "practise"
  | "pohybovka"
  | "spolecna"
  | "juniori-patek";

export type RecurringTrainerConfig = Partial<Record<RecurringTrainingKey, string>>;
export type RecurringCancellationNotice = {
  date: string;
  end: string;
  id: string;
  start: string;
  title: string;
};
type RecurringBookingOverride = {
  trainer?: string;
};
type RecurringBookingOverrides = Record<string, RecurringBookingOverride>;

export const recurringTrainingLabels: Array<{
  end: string;
  key: RecurringTrainingKey;
  label: string;
  schedule: string;
  start: string;
}> = [
  { end: "17:00", key: "deti", label: "Děti", schedule: "Pondělí 15:15-17:00", start: "15:15" },
  { end: "17:15", key: "juniori-utery", label: "Junioři", schedule: "Úterý 16:30-17:15", start: "16:30" },
  { end: "19:30", key: "practise", label: "Practise", schedule: "Úterý 17:30-19:30", start: "17:30" },
  { end: "18:00", key: "pohybovka", label: "Pohybovka", schedule: "Čtvrtek 17:15-18:00", start: "17:15" },
  { end: "19:30", key: "spolecna", label: "Společná LAT/STT", schedule: "Čtvrtek 18:00-19:30", start: "18:00" },
  { end: "17:00", key: "juniori-patek", label: "Junioři", schedule: "Pátek 16:00-17:00", start: "16:00" },
];

export async function getBookings() {
  return readBookings();
}

export async function getRecurringTrainers() {
  return readRecurringTrainers();
}

export async function getRecurringCancellationNotices() {
  const notices = (await readRecurringCancellations())
    .map(createRecurringCancellationNotice)
    .filter((notice): notice is RecurringCancellationNotice => Boolean(notice))
    .filter((notice) => notice.date >= getTodayPragueDateKey())
    .sort((left, right) =>
      `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
    );

  return notices;
}

export async function updateRecurringTrainers(input: RecurringTrainerConfig) {
  return withDatabaseLock(async () => {
    const nextConfig = normalizeRecurringTrainers(input);

    await writeRecurringTrainers(nextConfig);

    const bookings = await readBookings();
    await writeBookings(bookings);

    return nextConfig;
  });
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

export async function restoreBookingSnapshot(snapshot: Booking) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === snapshot.id);
    const conflict = findBookingConflict(bookings, snapshot, snapshot.id);

    if (conflict) {
      return { booking: null, conflict };
    }

    if (index === -1) {
      await writeBookings([...bookings, snapshot]);
      return { booking: snapshot, conflict: null };
    }

    bookings[index] = snapshot;
    await writeBookings(bookings);

    return { booking: snapshot, conflict: null };
  });
}

export async function reinstateRecurringBooking(id: string) {
  return withDatabaseLock(async () => {
    if (!id.startsWith("recurring-")) {
      return { booking: null };
    }

    await removeRecurringCancellation(id);

    const bookings = await readBookings();
    await writeBookings(bookings);

    return {
      booking: bookings.find((booking) => booking.id === id) ?? null,
    };
  });
}

export async function updateBookingTrainer(id: string, trainer: string) {
  return withDatabaseLock(async () => {
    const normalizedTrainer = trainer.trim();

    if (id.startsWith("recurring-")) {
      await updateRecurringOverride(id, { trainer: normalizedTrainer || undefined });

      const bookings = await readBookings();
      await writeBookings(bookings);

      return {
        booking: bookings.find((booking) => booking.id === id) ?? null,
        notFound: !bookings.some((booking) => booking.id === id),
      };
    }

    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, notFound: true };
    }

    const booking = {
      ...bookings[index],
      trainer: normalizedTrainer || undefined,
      updatedAt: new Date().toISOString(),
    };

    bookings[index] = booking;
    await writeBookings(bookings);

    return { booking, notFound: false };
  });
}

export async function deleteBooking(id: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const nextBookings = bookings.filter((booking) => booking.id !== id);

    if (nextBookings.length === bookings.length) {
      return false;
    }

    if (id.startsWith("recurring-")) {
      await addRecurringCancellation(id);
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

    return { booking: updatedBooking, notFound: false, previousBooking: booking };
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

async function addRecurringCancellation(id: string) {
  const cancellations = new Set(await readRecurringCancellations());

  cancellations.add(id);
  await writeRecurringCancellations([...cancellations]);
}

async function removeRecurringCancellation(id: string) {
  const cancellations = new Set(await readRecurringCancellations());

  cancellations.delete(id);
  await writeRecurringCancellations([...cancellations]);
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
  const cancelledIds = getRecurringCancellationsSync();
  const recurringOverrides = getRecurringOverridesSync();
  const recurringTrainers = getRecurringTrainersSync();
  const bookings: Booking[] = [];

  for (let offset = 0; offset <= recurringHorizonDays; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    const day = date.getUTCDay();
    const dateKey = formatUtcDateKey(date);

    if (day === 1) {
      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("deti", recurringTrainers, recurringOverrides, {
        id: `recurring-deti-${dateKey}`,
        title: "Děti",
        organizer: "Koskovi",
        date: dateKey,
        start: "15:15",
        end: "17:00",
        status: "confirmed",
        note: "Pravidelny pondelni trenink deti",
      }));
    }

    if (day === 2) {
      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("juniori-utery", recurringTrainers, recurringOverrides, {
        id: `recurring-juniori-utery-${dateKey}`,
        title: "Juniori",
        organizer: "Koskovi",
        date: dateKey,
        start: "16:30",
        end: "17:15",
        status: "confirmed",
        note: "Pravidelny uterni trenink junioru",
      }));

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("practise", recurringTrainers, recurringOverrides, {
        id: `recurring-practise-${dateKey}`,
        title: "Practise",
        organizer: "Koskovi",
        date: dateKey,
        start: "17:30",
        end: "19:30",
        status: "confirmed",
        note: "Pravidelna uterni akce",
      }));
    }

    if (day === 4) {
      const danceStyle = getAlternatingDanceStyle(dateKey);

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("pohybovka", recurringTrainers, recurringOverrides, {
        id: `recurring-pohybovka-${dateKey}`,
        title: "Pohybovka",
        organizer: "Koskovi",
        date: dateKey,
        start: "17:15",
        end: "18:00",
        status: "confirmed",
        note: "Pravidelna ctvrtecni akce",
      }));

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("spolecna", recurringTrainers, recurringOverrides, {
        id: `recurring-spolecna-${dateKey}`,
        title: `Společná ${danceStyle}`,
        organizer: "Koskovi",
        date: dateKey,
        start: "18:00",
        end: "19:30",
        status: "confirmed",
        note: "LAT a STT se stridaji po tydnu",
      }));
    }

    if (day === 5) {
      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("juniori-patek", recurringTrainers, recurringOverrides, {
        id: `recurring-juniori-patek-${dateKey}`,
        title: "Juniori",
        organizer: "Koskovi",
        date: dateKey,
        start: "16:00",
        end: "17:00",
        status: "confirmed",
        note: "Pravidelny patecni trenink junioru",
      }));
    }
  }

  return bookings;
}

function buildRecurringBooking(
  key: RecurringTrainingKey,
  recurringTrainers: RecurringTrainerConfig,
  recurringOverrides: RecurringBookingOverrides,
  booking: Booking,
) {
  const trainer = (
    recurringOverrides[booking.id]?.trainer ??
    recurringTrainers[key] ??
    ""
  ).trim();

  return {
    ...booking,
    note: trainer ? `${booking.note}\nTrenér: ${trainer}` : booking.note,
    recurringKey: key,
    trainer: trainer || undefined,
  };
}

function pushRecurringBooking(
  bookings: Booking[],
  cancelledIds: Set<string>,
  booking: Booking,
) {
  if (!cancelledIds.has(booking.id)) {
    bookings.push(booking);
  }
}

async function readRecurringCancellations() {
  try {
    return JSON.parse(
      await readFile(recurringCancellationsFile, "utf-8"),
    ) as string[];
  } catch {
    return [];
  }
}

function getRecurringCancellationsSync() {
  try {
    return new Set(
      JSON.parse(
        readFileSync(recurringCancellationsFile, "utf-8"),
      ) as string[],
    );
  } catch {
    return new Set<string>();
  }
}

function createRecurringCancellationNotice(
  id: string,
): RecurringCancellationNotice | null {
  if (!id.startsWith("recurring-")) {
    return null;
  }

  const date = id.slice(-10);
  const key = id.slice("recurring-".length, -11) as RecurringTrainingKey;
  const training = recurringTrainingLabels.find((item) => item.key === key);

  if (!training || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return {
    date,
    end: training.end,
    id,
    start: training.start,
    title: key === "spolecna"
      ? training.label.replace("LAT/STT", getAlternatingDanceStyle(date))
      : training.label,
  };
}

async function updateRecurringOverride(
  id: string,
  override: RecurringBookingOverride,
) {
  const overrides = await readRecurringOverrides();
  const nextOverride = {
    ...overrides[id],
    ...override,
  };

  if (!nextOverride.trainer) {
    delete nextOverride.trainer;
  }

  if (Object.keys(nextOverride).length === 0) {
    delete overrides[id];
  } else {
    overrides[id] = nextOverride;
  }

  await writeRecurringOverrides(overrides);
}

async function readRecurringOverrides() {
  try {
    return normalizeRecurringOverrides(
      JSON.parse(await readFile(recurringOverridesFile, "utf-8")) as RecurringBookingOverrides,
    );
  } catch {
    return {};
  }
}

function getRecurringOverridesSync() {
  try {
    return normalizeRecurringOverrides(
      JSON.parse(readFileSync(recurringOverridesFile, "utf-8")) as RecurringBookingOverrides,
    );
  } catch {
    return {};
  }
}

async function writeRecurringOverrides(overrides: RecurringBookingOverrides) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    temporaryRecurringOverridesFile,
    `${JSON.stringify(normalizeRecurringOverrides(overrides), null, 2)}\n`,
    "utf-8",
  );
  await rename(temporaryRecurringOverridesFile, recurringOverridesFile);
}

function normalizeRecurringOverrides(overrides: RecurringBookingOverrides) {
  const normalized: RecurringBookingOverrides = {};

  for (const [id, override] of Object.entries(overrides)) {
    if (!id.startsWith("recurring-") || typeof override !== "object") {
      continue;
    }

    const trainer = override.trainer?.trim();

    if (trainer) {
      normalized[id] = { trainer };
    }
  }

  return normalized;
}

async function writeRecurringCancellations(ids: string[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    temporaryRecurringCancellationsFile,
    `${JSON.stringify([...new Set(ids)].sort(), null, 2)}\n`,
    "utf-8",
  );
  await rename(
    temporaryRecurringCancellationsFile,
    recurringCancellationsFile,
  );
}

async function readRecurringTrainers() {
  try {
    return normalizeRecurringTrainers(
      JSON.parse(await readFile(recurringTrainersFile, "utf-8")) as RecurringTrainerConfig,
    );
  } catch {
    return {};
  }
}

function getRecurringTrainersSync() {
  try {
    return normalizeRecurringTrainers(
      JSON.parse(readFileSync(recurringTrainersFile, "utf-8")) as RecurringTrainerConfig,
    );
  } catch {
    return {};
  }
}

async function writeRecurringTrainers(config: RecurringTrainerConfig) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    temporaryRecurringTrainersFile,
    `${JSON.stringify(normalizeRecurringTrainers(config), null, 2)}\n`,
    "utf-8",
  );
  await rename(temporaryRecurringTrainersFile, recurringTrainersFile);
}

function normalizeRecurringTrainers(config: RecurringTrainerConfig) {
  const validKeys = new Set(recurringTrainingLabels.map((training) => training.key));
  const normalized: RecurringTrainerConfig = {};

  for (const [key, value] of Object.entries(config)) {
    if (!validKeys.has(key as RecurringTrainingKey) || typeof value !== "string") {
      continue;
    }

    const trainer = value.trim();

    if (trainer) {
      normalized[key as RecurringTrainingKey] = trainer;
    }
  }

  return normalized;
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
  return `${JSON.stringify(normalizeStoredBookings(bookings), null, 2)}\n`;
}

function normalizeStoredBookings(bookings: Booking[]) {
  const uniqueBookings = new Map<string, Booking>();

  for (const booking of removePastBookings(bookings)) {
    if (isRecurringBooking(booking)) {
      continue;
    }

    uniqueBookings.set(booking.id, booking);
  }

  return sortBookings([...uniqueBookings.values()]);
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
