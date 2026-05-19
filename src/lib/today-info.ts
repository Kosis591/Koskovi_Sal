type SvatkyDayResponse = {
  date?: string;
  dayInWeek?: string;
  dayNumber?: string;
  holidayName?: string | null;
  isHoliday?: boolean;
  month?: {
    genitive?: string;
  };
  name?: string;
  year?: string;
};

export type TodayInfo = {
  date: string;
  dateLabel: string;
  holidayName: string | null;
  isHoliday: boolean;
  nameDay: string | null;
  source: "fallback" | "svatkyapi";
  weekLabel: string;
};

export async function getTodayInfo(): Promise<TodayInfo> {
  const dateKey = formatPragueDateKey(new Date());
  const fallback = buildFallbackInfo(dateKey);

  try {
    const response = await fetch(
      `https://svatkyapi.netlify.app/api/day/${dateKey}`,
      {
        headers: {
          Accept: "application/json",
        },
        next: { revalidate: 60 * 60 },
        signal: AbortSignal.timeout(1200),
      },
    );

    if (!response.ok) {
      return fallback;
    }

    const day = (await response.json()) as SvatkyDayResponse;

    return {
      date: dateKey,
      dateLabel: formatDateLabel(day, dateKey),
      holidayName: day.holidayName ?? null,
      isHoliday: Boolean(day.isHoliday),
      nameDay: day.name ?? null,
      source: "svatkyapi",
      weekLabel: `${getIsoWeekNumber(dateKey)}. týden`,
    };
  } catch {
    return fallback;
  }
}

function buildFallbackInfo(dateKey: string): TodayInfo {
  return {
    date: dateKey,
    dateLabel: new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "long",
      weekday: "long",
      year: "numeric",
    }).format(new Date(`${dateKey}T12:00:00`)),
    holidayName: null,
    isHoliday: false,
    nameDay: null,
    source: "fallback",
    weekLabel: `${getIsoWeekNumber(dateKey)}. týden`,
  };
}

function formatDateLabel(day: SvatkyDayResponse, dateKey: string) {
  if (day.dayInWeek && day.dayNumber && day.month?.genitive && day.year) {
    return `${day.dayInWeek} ${day.dayNumber}. ${day.month.genitive} ${day.year}`;
  }

  return buildFallbackInfo(dateKey).dateLabel;
}

function formatPragueDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Prague",
    year: "numeric",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getIsoWeekNumber(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = date.getTime() - yearStart.getTime();

  return Math.ceil((diff / 86400000 + 1) / 7);
}
