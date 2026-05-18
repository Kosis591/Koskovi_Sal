import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const adminSessionCookie = "koskovi_admin_session";

const devPassword = "koskovi-admin";
const devSecret = "local-development-session-secret";

type AdminCredential = {
  password?: string;
  passwordHash?: string;
  username: string;
};

function getAdminCredentials(): AdminCredential[] {
  return [
    {
      username: process.env.ADMIN_USERNAME ?? "kosis",
      password: process.env.ADMIN_PASSWORD_HASH
        ? undefined
        : process.env.ADMIN_PASSWORD ?? devPassword,
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
  ];
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? devSecret;
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

function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("cs-CZ");
}
