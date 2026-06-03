import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { readDataTextSync } from "@/lib/runtime-storage";

export const adminSessionCookie = "koskovi_admin_session";

const devPassword = "koskovi-admin";
const devSecret = "local-development-session-secret";

type AdminCredential = {
  password?: string;
  passwordHash?: string;
  username: string;
};

export type StoredAdminUser = {
  createdAt?: string;
  createdBy?: string;
  passwordHash: string;
  updatedAt?: string;
  updatedBy?: string;
  username: string;
};

const adminUsersFile = "admin-users.json";

function getAdminCredentials(): AdminCredential[] {
  const credentials = [
    {
      username: process.env.ADMIN_USERNAME ?? "kosis",
      password: process.env.ADMIN_PASSWORD_HASH
        ? undefined
        : process.env.ADMIN_PASSWORD ??
          (process.env.NODE_ENV === "development" ? devPassword : undefined),
      passwordHash: process.env.ADMIN_PASSWORD_HASH,
    },
    {
      username: "JB",
      passwordHash: process.env.ADMIN_JB_PASSWORD_HASH,
    },
    {
      username: "sarka",
      passwordHash: process.env.ADMIN_SARKA_PASSWORD_HASH,
    },
    {
      username: "Pepe",
      passwordHash: process.env.ADMIN_PEPE_PASSWORD_HASH,
    },
    {
      username: "TKKoskovi",
      passwordHash: process.env.ADMIN_TKKOSKOVI_PASSWORD_HASH,
    },
  ];

  const mergedCredentials = new Map<string, AdminCredential>();

  for (const credential of credentials) {
    mergedCredentials.set(normalizeUsername(credential.username), credential);
  }

  for (const user of readStoredAdminUsersSync()) {
    mergedCredentials.set(normalizeUsername(user.username), {
      username: user.username,
      passwordHash: user.passwordHash,
    });
  }

  return [...mergedCredentials.values()];
}

function getSessionSecret() {
  const secret =
    process.env.ADMIN_SESSION_SECRET ??
    (process.env.NODE_ENV === "development" ? devSecret : "");

  if (!secret) {
    throw new Error("V produkci chybi promenna ADMIN_SESSION_SECRET.");
  }

  return secret;
}

export function createAdminSession(username: string) {
  const sessionId = randomUUID();
  const normalizedUsername = normalizeUsername(username);
  const signature = signSession(sessionId, normalizedUsername);

  return `${sessionId}.${encodeURIComponent(normalizedUsername)}.${signature}`;
}

export function isAdminCredentials(username: string, password: string) {
  const normalizedUsername = normalizeUsername(username);

  return getAdminCredentials().some(
    (credential) =>
      safeCompare(normalizedUsername, normalizeUsername(credential.username)) &&
      isPasswordValid(password, credential),
  );
}

export function isValidAdminSession(value?: string) {
  return Boolean(getAdminUsernameFromSession(value));
}

export function getAdminUsernameFromSession(value?: string) {
  if (!value) {
    return null;
  }

  const [sessionId, encodedUsername, signature] = value.split(".");

  if (!sessionId || !encodedUsername || !signature) {
    return null;
  }

  const username = decodeURIComponent(encodedUsername);

  if (!safeCompare(signature, signSession(sessionId, username))) {
    return null;
  }

  return username;
}

export function isAdminRequest(cookies: ReadonlyRequestCookies) {
  return isValidAdminSession(cookies.get(adminSessionCookie)?.value);
}

export function getAdminRequestUsername(cookies: ReadonlyRequestCookies) {
  return getAdminUsernameFromSession(cookies.get(adminSessionCookie)?.value);
}

export function isReadOnlyLessonUsername(username: string | null | undefined) {
  return normalizeUsername(username ?? "") === "tkkoskovi";
}

export function listAdminUsernames() {
  return getAdminCredentials().map((credential) => credential.username);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");

  return `scrypt$${salt}$${key}`;
}

export function verifyAdminPassword(username: string, password: string) {
  return isAdminCredentials(username, password);
}

function signSession(sessionId: string, username: string) {
  return createHmac("sha256", getSessionSecret())
    .update(`${sessionId}.${username}`)
    .digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isPasswordValid(password: string, credential: AdminCredential) {
  if (credential.passwordHash) {
    return verifyPasswordHash(password, credential.passwordHash);
  }

  if (!credential.password) {
    return false;
  }

  return safeCompare(password, credential.password);
}

function verifyPasswordHash(password: string, passwordHash: string) {
  const [scheme, salt, key] = passwordHash.split("$");

  if (scheme !== "scrypt" || !salt || !key) {
    return false;
  }

  const expectedKey = Buffer.from(key, "hex");
  const actualKey = scryptSync(password, salt, expectedKey.length);

  if (actualKey.length !== expectedKey.length) {
    return false;
  }

  return timingSafeEqual(actualKey, expectedKey);
}

export function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("cs-CZ");
}

function readStoredAdminUsersSync() {
  try {
    const content = readDataTextSync(adminUsersFile);
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
