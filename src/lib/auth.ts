import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const adminSessionCookie = "koskovi_admin_session";

const devPassword = "koskovi-admin";
const devSecret = "local-development-session-secret";

type AdminCredential = {
  username: string;
  password: string;
};

function getAdminCredentials(): AdminCredential[] {
  return [
    {
      username: process.env.ADMIN_USERNAME ?? "kosis",
      password: process.env.ADMIN_PASSWORD ?? devPassword,
    },
    {
      username: "JB",
      password: "Nellinka24",
    },
    {
      username: "sarka",
      password: "barunka5",
    },
    {
      username: "Pepe",
      password: "Petruska04",
    }
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
      safeCompare(password, credential.password),
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

function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("cs-CZ");
}
