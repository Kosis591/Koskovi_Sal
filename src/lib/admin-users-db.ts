import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  hashPassword,
  listAdminUsernames,
  normalizeUsername,
  type StoredAdminUser,
} from "@/lib/auth";

const dataDir = path.join(process.cwd(), "data");
const usersFile = path.join(dataDir, "admin-users.json");
const temporaryUsersFile = path.join(dataDir, "admin-users.json.tmp");

let usersQueue = Promise.resolve();

export async function getAdminUsers() {
  const storedUsers = await readStoredUsers();
  const storedByUsername = new Map(
    storedUsers.map((user) => [normalizeUsername(user.username), user]),
  );

  return listAdminUsernames()
    .map((username) => {
      const storedUser = storedByUsername.get(normalizeUsername(username));

      return {
        isStored: Boolean(storedUser),
        username: storedUser?.username ?? username,
      };
    })
    .sort((left, right) => left.username.localeCompare(right.username, "cs-CZ"));
}

export async function upsertAdminUserPassword(input: {
  actor: string;
  password: string;
  username: string;
}) {
  return withUsersLock(async () => {
    const now = new Date().toISOString();
    const normalizedUsername = normalizeUsername(input.username);
    const users = await readStoredUsers();
    const existingIndex = users.findIndex(
      (user) => normalizeUsername(user.username) === normalizedUsername,
    );
    const previousUser = existingIndex >= 0 ? users[existingIndex] : null;
    const nextUser: StoredAdminUser = {
      createdAt: previousUser?.createdAt ?? now,
      createdBy: previousUser?.createdBy ?? input.actor,
      passwordHash: hashPassword(input.password),
      updatedAt: now,
      updatedBy: input.actor,
      username: previousUser?.username ?? input.username.trim(),
    };

    if (existingIndex >= 0) {
      users[existingIndex] = nextUser;
    } else {
      users.push(nextUser);
    }

    await writeStoredUsers(users);

    return {
      isStored: true,
      username: nextUser.username,
    };
  });
}

async function readStoredUsers() {
  await ensureDataDirectory();

  try {
    const content = await readFile(usersFile, "utf8");
    const parsed = JSON.parse(content) as StoredAdminUser[];

    return Array.isArray(parsed)
      ? parsed.filter((user) => user.username && user.passwordHash)
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeStoredUsers(users: StoredAdminUser[]) {
  await ensureDataDirectory();
  await writeFile(temporaryUsersFile, JSON.stringify(users, null, 2));
  await rename(temporaryUsersFile, usersFile);
}

async function ensureDataDirectory() {
  await mkdir(dataDir, { recursive: true });
}

function withUsersLock<T>(operation: () => Promise<T>) {
  const nextOperation = usersQueue.then(operation, operation);
  usersQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}
