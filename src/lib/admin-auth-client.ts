export type AdminSession = {
  authenticated: boolean;
  username?: string | null;
};

export async function loginAdmin(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, username }),
  });

  if (!response.ok) {
    const data = (await response.json()) as { message?: string };

    throw new Error(data.message ?? "Přihlášení se nepodařilo.");
  }

  return response;
}

export async function logoutAdmin() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getAdminSession() {
  const response = await fetch("/api/auth/session");

  return (await response.json()) as AdminSession;
}
