import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestUsername } from "@/lib/auth";
import {
  replaceImportedIndividualLessons,
  type ImportedIndividualLesson,
} from "@/lib/individual-lessons-db";
import { trainerOptions } from "@/lib/schedule";

export const dynamic = "force-dynamic";

type TimeRange = {
  end: string;
  start: string;
};

type LessonContext = {
  dateOrDay: string;
  trainer: string;
};

type GoogleSheetInfo = {
  gid: string;
  name: string;
};

const skippedLessonNames = new Set([
  "xxxxx",
  "obed",
  "vecere",
  "warm up",
  "practise",
  "prijezd",
  "strecink",
  "seminar",
]);

const weekdays = new Set([
  "pondeli",
  "utery",
  "streda",
  "ctvrtek",
  "patek",
  "sobota",
  "nedele",
]);

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const username = getAdminRequestUsername(cookieStore);

  if (username !== "kosis") {
    return NextResponse.json(
      { message: "Import rozpisu může ukládat jen kosis." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as { url?: string };
  const sourceUrl = payload.url?.trim();

  if (!sourceUrl) {
    return NextResponse.json(
      { message: "Vlož odkaz na Google tabulku." },
      { status: 400 },
    );
  }

  let spreadsheetId: string;
  let requestedGid: string;

  try {
    const parsed = parseGoogleSpreadsheetUrl(sourceUrl);
    spreadsheetId = parsed.spreadsheetId;
    requestedGid = parsed.gid;
  } catch {
    return NextResponse.json(
      { message: "Odkaz nevypadá jako Google tabulka." },
      { status: 400 },
    );
  }

  let sheets: GoogleSheetInfo[];

  try {
    sheets = await getSpreadsheetSheets(spreadsheetId, requestedGid);
  } catch {
    return NextResponse.json(
      { message: "Google tabulku se nepodařilo načíst." },
      { status: 502 },
    );
  }

  const lessonsBySheet = await Promise.all(
    sheets.map(async (sheet) => {
      const response = await fetch(toGoogleCsvUrl(spreadsheetId, sheet.gid), {
        cache: "no-store",
      });

      if (!response.ok) {
        return [];
      }

      return parseLessonCsv(await response.text(), sheet.name);
    }),
  );
  const lessons = dedupeLessons(lessonsBySheet.flat());

  if (lessons.length === 0) {
    return NextResponse.json(
      { message: "V tabulce se nepodařilo rozpoznat žádné lekce." },
      { status: 400 },
    );
  }

  const storedLessons = await replaceImportedIndividualLessons(lessons);

  return NextResponse.json(
    {
      lessons: storedLessons,
      message: `Rozpis soustředění je naimportovaný (${storedLessons.length} lekcí z ${sheets.length} dnů).`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function parseGoogleSpreadsheetUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

  if (!match) {
    throw new Error("Neplatný odkaz na Google tabulku.");
  }

  return {
    gid: url.hash.match(/gid=(\d+)/)?.[1] ?? url.searchParams.get("gid") ?? "0",
    spreadsheetId: match[1],
  };
}

function toGoogleCsvUrl(spreadsheetId: string, gid: string) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

async function getSpreadsheetSheets(spreadsheetId: string, fallbackGid: string) {
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Google spreadsheet HTML could not be loaded.");
  }

  const sheets = parseSheetList(await response.text());

  return sheets.length > 0
    ? sheets
    : [{ gid: fallbackGid, name: "Soustředění" }];
}

function parseSheetList(html: string) {
  const sheets: GoogleSheetInfo[] = [];
  const regex = /items\.push\(\{name:\s*"([^"]+)"[\s\S]*?gid:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    sheets.push({
      gid: match[2],
      name: decodeGoogleHtmlString(match[1]),
    });
  }

  return sheets;
}

function decodeGoogleHtmlString(value: string) {
  return value
    .replace(/\\x3d/g, "=")
    .replace(/\\\//g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseLessonCsv(csv: string, sheetName = "") {
  const rows = parseCsv(csv).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );

  const lessons = dedupeLessons([
    ...parseClassicalLessonRows(rows),
    ...parseBlockLessonRows(rows),
  ]);

  if (!sheetName.trim()) {
    return lessons;
  }

  return lessons.map((lesson) => ({
    ...lesson,
    dateOrDay: sheetName.trim(),
  }));
}

function parseClassicalLessonRows(rows: string[][]) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) =>
      ["cas", "trener", "par", "jmeno", "tanecnik"].includes(normalize(cell)),
    ),
  );

  if (headerIndex < 0) {
    return [];
  }

  const header = rows[headerIndex].map(normalize);
  const dataRows = rows.slice(headerIndex + 1);

  return dataRows
    .map((row) => parseClassicalLessonRow(row, header))
    .filter((lesson): lesson is ImportedIndividualLesson => Boolean(lesson));
}

function parseClassicalLessonRow(row: string[], header: string[]) {
  const timeCell =
    getCellByHeader(row, header, ["cas", "time"]) ??
    row.find((cell) => extractTimeRanges(cell).length > 0);
  const time = timeCell ? extractTimeRanges(timeCell)[0] : null;

  if (!time) {
    return null;
  }

  const trainer =
    getCellByHeader(row, header, ["trener", "lektor"]) ??
    row.find((cell) =>
      trainerOptions.some(
        (trainerName) => normalize(trainerName) === normalize(cell),
      ),
    ) ??
    "";
  const dateOrDay =
    getCellByHeader(row, header, ["datum", "den", "day"]) ??
    row.find((cell) => cell !== timeCell && cell !== trainer) ??
    "";
  const name =
    getCellByHeader(row, header, ["par", "jmeno", "tanecnik"]) ??
    row
      .filter((cell) => cell !== timeCell && cell !== trainer && cell !== dateOrDay)
      .join(" ")
      .trim();

  return createLesson({ dateOrDay, name, time, trainer });
}

function parseBlockLessonRows(rows: string[][]) {
  const lessons: ImportedIndividualLesson[] = [];
  const contexts = new Map<number, LessonContext>();
  let currentDateOrDay = "";

  for (const row of rows) {
    for (let column = 0; column < row.length; column += 2) {
      const leftCell = row[column]?.trim() ?? "";
      const rightCell = row[column + 1]?.trim() ?? "";

      if (!leftCell && !rightCell) {
        continue;
      }

      const headerWithoutTimes = parseBlockHeaderWithoutTimes(leftCell);

      if (!rightCell && headerWithoutTimes.trainer) {
        if (headerWithoutTimes.dateOrDay) {
          currentDateOrDay = headerWithoutTimes.dateOrDay;
        }

        contexts.set(column, {
          dateOrDay: headerWithoutTimes.dateOrDay || currentDateOrDay,
          trainer: headerWithoutTimes.trainer,
        });
        continue;
      }

      const header = parseBlockHeader(leftCell, currentDateOrDay);

      if (header.dateOrDay) {
        currentDateOrDay = header.dateOrDay;
      }

      if (header.trainer) {
        contexts.set(column, {
          dateOrDay: header.dateOrDay || currentDateOrDay,
          trainer: header.trainer,
        });
      } else if (isTrainerOnlyCell(leftCell)) {
        contexts.set(column, {
          dateOrDay: currentDateOrDay,
          trainer: toDisplayName(leftCell),
        });
      }

      const context = contexts.get(column);

      if (!context?.dateOrDay || !context.trainer || !rightCell) {
        continue;
      }

      const times =
        header.times.length > 0 ? header.times : extractTimeRanges(leftCell);

      if (times.length === 0) {
        continue;
      }

      const names = splitLessonNames(rightCell, times.length);

      for (const [index, time] of times.entries()) {
        const lesson = createLesson({
          dateOrDay: context.dateOrDay,
          name: names[index] ?? "",
          time,
          trainer: context.trainer,
        });

        if (lesson) {
          lessons.push(lesson);
        }
      }
    }
  }

  return lessons;
}

function parseBlockHeaderWithoutTimes(value: string) {
  if (!value.trim() || extractTimeRanges(value).length > 0) {
    return { dateOrDay: "", trainer: "" };
  }

  const dateParts = parseDateAndTrainer(value);

  if (dateParts.dateOrDay && dateParts.trainer) {
    return dateParts;
  }

  if (isTrainerOnlyCell(value)) {
    return {
      dateOrDay: "",
      trainer: toDisplayName(value),
    };
  }

  return { dateOrDay: "", trainer: "" };
}

function parseBlockHeader(value: string, fallbackDateOrDay: string) {
  const times = extractTimeRanges(value);

  if (times.length === 0) {
    return { dateOrDay: "", times, trainer: "" };
  }

  const firstTimeIndex = value.search(/\d{1,2}[:.]\d{2}/);
  const beforeFirstTime =
    firstTimeIndex >= 0 ? value.slice(0, firstTimeIndex).trim() : "";
  const dateParts = parseDateAndTrainer(beforeFirstTime);

  return {
    dateOrDay: dateParts.dateOrDay || fallbackDateOrDay,
    times,
    trainer: dateParts.trainer,
  };
}

function parseDateAndTrainer(value: string) {
  const dateMatch = value.match(/^(\d{1,2}\.\s*\d{1,2}\.)(.*)$/);

  if (!dateMatch) {
    return {
      dateOrDay: "",
      trainer: value ? toDisplayName(value) : "",
    };
  }

  const restTokens = dateMatch[2].trim().split(/\s+/).filter(Boolean);
  const weekdayToken =
    restTokens[0] && weekdays.has(normalize(restTokens[0]))
      ? restTokens.shift()
      : "";
  const dateOrDay = [
    dateMatch[1].replace(/\s+/g, " ").trim(),
    weekdayToken ? toDisplayName(weekdayToken) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    dateOrDay,
    trainer: toDisplayName(restTokens.join(" ")),
  };
}

function isTrainerOnlyCell(value: string) {
  if (!value.trim() || extractTimeRanges(value).length > 0) {
    return false;
  }

  const normalized = normalize(value);

  if (skippedLessonNames.has(normalized)) {
    return false;
  }

  return value.trim().length <= 24;
}

function splitLessonNames(value: string, expectedCount: number) {
  const compacted = value
    .replace(/\bWARM\s+UP\b/gi, "WARM_UP")
    .replace(/\bSOU\s*\+\s*MAL\b/gi, "SOU_+_MAL");
  const names = compacted
    .split(/\s+/)
    .map((name) =>
      name
        .replace(/_/g, " ")
        .replace(/\s*\+\s*/g, " + ")
        .trim(),
    )
    .filter(Boolean);

  if (names.length >= expectedCount) {
    return names.slice(0, expectedCount);
  }

  return names;
}

function createLesson({
  dateOrDay,
  name,
  time,
  trainer,
}: {
  dateOrDay: string;
  name: string;
  time: TimeRange;
  trainer: string;
}) {
  const cleanName = toDisplayName(name);

  if (
    !dateOrDay.trim() ||
    !trainer.trim() ||
    !cleanName ||
    skippedLessonNames.has(normalize(cleanName))
  ) {
    return null;
  }

  return {
    dateOrDay: dateOrDay.trim(),
    end: time.end,
    name: cleanName,
    start: time.start,
    trainer: toDisplayName(trainer),
  };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function getCellByHeader(row: string[], header: string[], aliases: string[]) {
  const index = header.findIndex((cell) => aliases.includes(cell));

  return index >= 0 ? row[index] : undefined;
}

function extractTimeRanges(value: string) {
  const ranges: TimeRange[] = [];
  const regex =
    /(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*(\d{1,2})[:.](\d{2}))?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value)) !== null) {
    const start = `${match[1].padStart(2, "0")}:${match[2]}`;
    const end = match[3]
      ? `${match[3].padStart(2, "0")}:${match[4]}`
      : addMinutesToTime(start, 45);

    ranges.push({ end, start });
  }

  return ranges;
}

function addMinutesToTime(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function dedupeLessons(lessons: ImportedIndividualLesson[]) {
  const seen = new Set<string>();
  const deduped: ImportedIndividualLesson[] = [];

  for (const lesson of lessons) {
    const key = [
      normalize(lesson.dateOrDay),
      lesson.start,
      lesson.end,
      normalize(lesson.trainer),
      normalize(lesson.name),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(lesson);
  }

  return deduped;
}

function toDisplayName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => {
      if (part === "+") {
        return part;
      }

      return part
        .split("-")
        .map((dashPart) =>
          dashPart
            ? `${dashPart.charAt(0).toLocaleUpperCase("cs-CZ")}${dashPart
                .slice(1)
                .toLocaleLowerCase("cs-CZ")}`
            : dashPart,
        )
        .join("-");
    })
    .join(" ");
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
