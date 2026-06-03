import {
  ensureDataStorage,
  readDataText,
  writeDataText,
} from "@/lib/runtime-storage";

export type ImportedIndividualLesson = {
  dateOrDay: string;
  end: string;
  name: string;
  start: string;
  trainer: string;
};

const lessonsFile = "individual-lessons.json";

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
  await ensureDataStorage();

  try {
    const content = await readDataText(lessonsFile);
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
  await ensureDataStorage();
  await writeDataText(lessonsFile, JSON.stringify(lessons, null, 2));
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

function withLessonsLock<T>(operation: () => Promise<T>) {
  const nextOperation = lessonsQueue.then(operation, operation);
  lessonsQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}
