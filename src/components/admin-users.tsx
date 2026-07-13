"use client";

import { Check, Filter, KeyRound, LogIn, LogOut, UserPlus } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SiteShell } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAdminSession, loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";

type LessonFilter = {
  type: "all" | "dancer" | "trainer";
  value: string;
};

type AdminUser = {
  isStored: boolean;
  lessonFilter: LessonFilter;
  username: string;
};

const emptyLessonFilter: LessonFilter = { type: "all", value: "" };

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFilter, setNewUserFilter] =
    useState<LessonFilter>(emptyLessonFilter);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [userFilters, setUserFilters] = useState<Record<string, LessonFilter>>({});
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/admin-users", { cache: "no-store" });

    if (!response.ok) {
      setUsers([]);
      return;
    }

    const data = (await response.json()) as { users: AdminUser[] };
    setUsers(data.users);
    setUserFilters(
      Object.fromEntries(
        data.users.map((user) => [
          user.username,
          user.lessonFilter ?? emptyLessonFilter,
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    async function loadSession() {
      const session = await getAdminSession();
      setIsAuthenticated(session.authenticated);
      setSessionUsername(session.username ?? null);

      if (session.username === "kosis") {
        await loadUsers();
      }

      setIsLoading(false);
    }

    void loadSession();
  }, [loadUsers]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      await loginAdmin(username, password);
      const session = await getAdminSession();
      setSessionUsername(session.username ?? null);
      setIsAuthenticated(session.authenticated);

      if (session.username === "kosis") {
        await loadUsers();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Přihlášení se nepodařilo.",
      );
    }
  }

  async function handleLogout() {
    await logoutAdmin();
    setIsAuthenticated(false);
    setSessionUsername(null);
    setUsers([]);
  }

  async function saveUser(input: {
    lessonFilter?: LessonFilter;
    password?: string;
    username: string;
  }) {
    setMessage("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(data.message ?? "Uživatele se nepodařilo uložit.");
        return false;
      }

      setMessage(data.message ?? "Uživatel je uložený.");
      await loadUsers();
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await saveUser({
      lessonFilter: newUserFilter,
      password: newUserPassword,
      username: newUsername,
    });

    if (saved) {
      setNewUsername("");
      setNewUserPassword("");
      setNewUserFilter(emptyLessonFilter);
    }
  }

  async function handleResetPassword(
    event: FormEvent<HTMLFormElement>,
    user: AdminUser,
  ) {
    event.preventDefault();
    const nextPassword = resetPasswords[user.username] ?? "";
    const saved = await saveUser({
      password: nextPassword,
      username: user.username,
    });

    if (saved) {
      setResetPasswords((current) => ({ ...current, [user.username]: "" }));
    }
  }

  async function handleSaveFilter(
    event: FormEvent<HTMLFormElement>,
    user: AdminUser,
  ) {
    event.preventDefault();
    await saveUser({
      lessonFilter: userFilters[user.username] ?? emptyLessonFilter,
      username: user.username,
    });
  }

  return (
    <SiteShell
      actions={
        <>
          <ThemeToggle />
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            href="/"
          >
            Zpět na kalendář
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            href="/admin"
          >
            Zpět do správy
          </Link>
          {isAuthenticated ? (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#003758] transition hover:bg-[#eef6fa]"
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={17} />
              Odhlásit
            </button>
          ) : null}
        </>
      }
      contentClassName="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(320px,420px)_1fr] lg:px-8"
      description="Seznam uživatelů, vytváření účtů, reset hesel a filtry soustředění."
      maxWidthClassName="max-w-[1440px]"
      title="Správa uživatelů"
    >
      {isLoading ? (
        <div className="rounded-lg border border-[#ded6c9] bg-white p-5">
          Načítám...
        </div>
      ) : !isAuthenticated ? (
        <form
          className="rounded-lg border border-[#ded6c9] bg-white p-5 lg:max-w-md"
          onSubmit={handleLogin}
        >
          <h2 className="text-xl font-semibold">Přihlášení uživatele</h2>
          <div className="mt-5 grid gap-3">
            <input
              className="field-input"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Jméno"
              required
              value={username}
            />
            <input
              className="field-input"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Heslo"
              required
              type="password"
              value={password}
            />
          </div>
          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76]"
            type="submit"
          >
            <LogIn size={17} />
            Přihlásit
          </button>
        </form>
      ) : sessionUsername !== "kosis" ? (
        <section className="rounded-lg border border-[#ded6c9] bg-white p-5 lg:col-span-2 lg:max-w-xl">
          <h2 className="text-xl font-semibold">Přístup má jen kosis</h2>
          <p className="mt-2 text-sm leading-6 text-[#66706f]">
            Správa uživatelů je dostupná pouze hlavnímu administrátorovi.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-[#ded6c9] bg-white p-5">
            <div className="flex items-start gap-3">
              <UserPlus className="mt-1 text-[#003758]" size={22} />
              <div>
                <h2 className="text-xl font-semibold">Nový uživatel</h2>
                <p className="mt-1 text-sm text-[#66706f]">
                  Heslo se uloží pouze jako scrypt hash. Filtr je volitelný.
                </p>
              </div>
            </div>
            <form className="mt-5 grid gap-3" onSubmit={handleCreateUser}>
              <input
                className="field-input"
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="Jméno uživatele"
                required
                value={newUsername}
              />
              <input
                className="field-input"
                onChange={(event) => setNewUserPassword(event.target.value)}
                placeholder="Heslo"
                required
                type="password"
                value={newUserPassword}
              />
              <LessonFilterFields
                filter={newUserFilter}
                onChange={setNewUserFilter}
              />
              <button
                className="inline-flex h-11 items-center justify-center rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                Uložit uživatele
              </button>
            </form>
            {message ? (
              <p className="mt-4 flex items-center gap-2 rounded-md border border-[#cde6d9] bg-[#f4fbf7] px-3 py-2 text-sm text-[#245d3f]">
                <Check size={16} />
                {message}
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
            <div className="border-b border-[#ded6c9] px-5 py-4">
              <h2 className="text-xl font-semibold">Uživatelé</h2>
              <p className="mt-1 text-sm text-[#66706f]">
                Zobrazeno {users.length} účtů. Prázdný filtr znamená, že
                uživatel vidí celé soustředění.
              </p>
            </div>
            <div className="divide-y divide-[#ece3d5]">
              {users.map((user) => (
                <div className="grid gap-4 px-5 py-4" key={user.username}>
                  <div>
                    <p className="font-semibold">{user.username}</p>
                    <p className="text-xs text-[#66706f]">
                      {user.isStored
                        ? "Heslo je uložené v databázi"
                        : "Výchozí účet z konfigurace"}
                    </p>
                  </div>
                  <form
                    className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-end"
                    onSubmit={(event) => handleResetPassword(event, user)}
                  >
                    <label className="field-label">
                      Nové heslo
                      <input
                        className="field-input mt-1"
                        onChange={(event) =>
                          setResetPasswords((current) => ({
                            ...current,
                            [user.username]: event.target.value,
                          }))
                        }
                        placeholder="Nové heslo"
                        required
                        type="password"
                        value={resetPasswords[user.username] ?? ""}
                      />
                    </label>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ded6c9] px-3 text-sm font-semibold text-[#003758] transition hover:bg-[#f6f1e8] disabled:opacity-60"
                      disabled={isSaving}
                      type="submit"
                    >
                      <KeyRound size={15} />
                      Reset hesla
                    </button>
                  </form>
                  <form
                    className="grid gap-3 rounded-md border border-[#ece3d5] bg-[#fcfaf6] p-3 lg:grid-cols-[1fr_auto] lg:items-end"
                    onSubmit={(event) => handleSaveFilter(event, user)}
                  >
                    <LessonFilterFields
                      filter={userFilters[user.username] ?? emptyLessonFilter}
                      onChange={(filter) =>
                        setUserFilters((current) => ({
                          ...current,
                          [user.username]: filter,
                        }))
                      }
                    />
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#003758] px-3 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:opacity-60"
                      disabled={isSaving}
                      type="submit"
                    >
                      <Filter size={15} />
                      Uložit filtr
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </SiteShell>
  );
}

function LessonFilterFields({
  filter,
  onChange,
}: {
  filter: LessonFilter;
  onChange: (filter: LessonFilter) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[180px_1fr]">
      <label className="field-label">
        Filtr soustředění
        <select
          className="field-input mt-1"
          onChange={(event) => {
            const type = event.target.value as LessonFilter["type"];
            onChange({
              type,
              value: type === "all" ? "" : filter.value,
            });
          }}
          value={filter.type}
        >
          <option value="all">Bez omezení</option>
          <option value="dancer">Tanečník / pár</option>
          <option value="trainer">Trenér</option>
        </select>
      </label>
      <label className="field-label">
        Hodnota filtru
        <input
          className="field-input mt-1"
          disabled={filter.type === "all"}
          onChange={(event) =>
            onChange({
              ...filter,
              value: event.target.value,
            })
          }
          placeholder={
            filter.type === "trainer"
              ? "Např. Barča"
              : filter.type === "dancer"
                ? "Např. Novákovi"
                : "Prázdné = vše"
          }
          value={filter.value}
        />
      </label>
    </div>
  );
}
