import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ImportedIndividualLesson = {
  dateOrDay: string;
  end: string;
  name: string;
  start: string;
  trainer: string;
};

const dataDir = path.join(process.cwd(), "data");
const lessonsFile = path.join(dataDir, "individual-lessons.json");
const temporaryLessonsFile = path.join(dataDir, "individual-lessons.json.tmp");

let lessonsQueue = Promise.resolve();

export async function getImportedIndividualLessons() {
  return readImportedLessons();
}

export async function replaceImportedIndividualLessons(
  lessons: ImportedIndividualLesson[],
) {
  return withLessonsLock(async () => {
    const normalizedLessons = lessons
      .map(normalizeImportedLesson)
      .filter((lesson): lesson is ImportedIndividualLesson => Boolean(lesson));

    await writeImportedLessons(normalizedLessons);

    return normalizedLessons;
  });
}

async function readImportedLessons() {
  await ensureDataDirectory();

  try {
    const content = await readFile(lessonsFile, "utf8");
    const parsed = JSON.parse(content) as ImportedIndividualLesson[];

    return Array.isArray(parsed)
      ? parsed
          .map(normalizeImportedLesson)
          .filter((lesson): lesson is ImportedIndividualLesson => Boolean(lesson))
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeImportedLessons(lessons: ImportedIndividualLesson[]) {
  await ensureDataDirectory();
  await writeFile(temporaryLessonsFile, JSON.stringify(lessons, null, 2));
  await rename(temporaryLessonsFile, lessonsFile);
}

function normalizeImportedLesson(
  lesson: ImportedIndividualLesson,
): ImportedIndividualLesson | null {
  const dateOrDay = lesson.dateOrDay?.trim();
  const end = lesson.end?.trim();
  const name = lesson.name?.trim();
  const start = lesson.start?.trim();
  const trainer = lesson.trainer?.trim();

  if (!dateOrDay || !end || !name || !start || !trainer) {
    return null;
  }

  return { dateOrDay, end, name, start, trainer };
}

async function ensureDataDirectory() {
  await mkdir(dataDir, { recursive: true });
}

function withLessonsLock<T>(operation: () => Promise<T>) {
  const nextOperation = lessonsQueue.then(operation, operation);
  lessonsQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}
