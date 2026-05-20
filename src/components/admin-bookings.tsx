"use client";

import { Check, LogIn, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SiteShell } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAdminSession, loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";
import { trainerOptions, type Booking } from "@/lib/schedule";

type AuditLogEntry = {
  action: string;
  actor: string;
  bookingId?: string;
  details?: {
    booking?: Booking;
    date?: string;
    previousBooking?: Booking;
    title?: string;
  };
  timestamp: string;
};

type RecurringTrainingLabel = {
  key: string;
  label: string;
  schedule: string;
};

const bookingsPerPage = 8;

export function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [recurringTrainerLabels, setRecurringTrainerLabels] = useState<
    RecurringTrainingLabel[]
  >([]);
  const [username, setUsername] = useState("");
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [savingTrainerBookingId, setSavingTrainerBookingId] = useState("");
  const [undoingTimestamp, setUndoingTimestamp] = useState("");
  const [message, setMessage] = useState("");

  const loadAuditLog = useCallback(async () => {
    const response = await fetch("/api/audit-log", { cache: "no-store" });

    if (!response.ok) {
      setAuditLog([]);
      return;
    }

    const data = (await response.json()) as { entries: AuditLogEntry[] };
    setAuditLog(data.entries);
  }, []);

  const loadBookings = useCallback(async () => {
    const response = await fetch("/api/bookings", { cache: "no-store" });

    if (!response.ok) {
      setBookings([]);
      return;
    }

    const data = (await response.json()) as { bookings: Booking[] };
    setBookings(data.bookings);
  }, []);

  const loadRecurringLabels = useCallback(async () => {
    const response = await fetch("/api/recurring-trainers", { cache: "no-store" });

    if (!response.ok) {
      setRecurringTrainerLabels([]);
      return;
    }

    const data = (await response.json()) as { labels: RecurringTrainingLabel[] };
    setRecurringTrainerLabels(data.labels);
  }, []);

  const totalBookingPages = Math.max(1, Math.ceil(bookings.length / bookingsPerPage));
  const visibleBookingsPage = Math.min(bookingsPage, totalBookingPages);
  const paginatedBookings = useMemo(
    () =>
      bookings.slice(
        (visibleBookingsPage - 1) * bookingsPerPage,
        visibleBookingsPage * bookingsPerPage,
      ),
    [bookings, visibleBookingsPage],
  );
  const nextRecurringBookings = useMemo(() => {
    const today = getTodayPragueDateKey();
    const nextByKey = new Map<string, Booking>();

    for (const booking of bookings) {
      if (!booking.recurringKey || booking.date < today) {
        continue;
      }

      const current = nextByKey.get(booking.recurringKey);
      const bookingKey = `${booking.date}${booking.start}`;
      const currentKey = current ? `${current.date}${current.start}` : "";

      if (!current || bookingKey.localeCompare(currentKey) < 0) {
        nextByKey.set(booking.recurringKey, booking);
      }
    }

    return nextByKey;
  }, [bookings]);
  const visibleAuditLog = useMemo(() => {
    if (sessionUsername === "kosis") {
      return auditLog;
    }

    return auditLog.filter(
      (entry) =>
        entry.action === "booking.delete" && entry.actor === sessionUsername,
    );
  }, [auditLog, sessionUsername]);

  useEffect(() => {
    async function loadSession() {
      const session = await getAdminSession();
      setIsAuthenticated(session.authenticated);
      setSessionUsername(session.username ?? null);

      if (session.authenticated) {
        await Promise.all([loadBookings(), loadRecurringLabels()]);

        if (session.username) {
          await loadAuditLog();
        }
      }

      setIsLoading(false);
    }

    void loadSession();
  }, [loadAuditLog, loadBookings, loadRecurringLabels]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    try {
      await loginAdmin(username, password);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Přihlášení se nezdařilo.",
      );
      return;
    }

    setUsername("");
    setPassword("");
    setIsAuthenticated(true);
    const session = await getAdminSession();
    setSessionUsername(session.username ?? null);
    await Promise.all([loadBookings(), loadRecurringLabels()]);

    if (session.username) {
      await loadAuditLog();
    }
  }

  async function handleLogout() {
    await logoutAdmin();
    setIsAuthenticated(false);
    setSessionUsername(null);
    setBookings([]);
    setAuditLog([]);
    setRecurringTrainerLabels([]);
    setMessage("");
  }

  async function handleAdminBookingTrainerChange(bookingId: string, trainer: string) {
    setSavingTrainerBookingId(bookingId);
    setMessage("");

    try {
      const response = await fetch(`/api/bookings/${bookingId}/trainer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(data.message ?? "Trenéra se nepodařilo uložit.");
        return;
      }

      setMessage(trainer ? "Trenér je uložený." : "Trenér byl odebraný.");
      await loadBookings();
    } finally {
      setSavingTrainerBookingId("");
    }
  }

  async function handleDelete(id: string) {
    const response = await fetch(`/api/bookings/${id}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage("Akci se nepodařilo smazat.");
      return;
    }

    setMessage("Akce je smazána.");
    await loadBookings();
  }

  async function handleUndoAuditEntry(entry: AuditLogEntry) {
    setUndoingTimestamp(entry.timestamp);
    setMessage("");

    try {
      const response = await fetch("/api/audit-log/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp: entry.timestamp }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(data.message ?? "Operaci se nepodařilo vrátit.");
        return;
      }

      setMessage(data.message ?? "Operace byla vrácena.");
      await Promise.all([loadBookings(), loadAuditLog()]);
    } finally {
      setUndoingTimestamp("");
    }
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
      description="Přehled, mazání a rychlá údržba rezervací uložených v databázi."
      maxWidthClassName="max-w-[1840px]"
      title="Správa akcí"
    >
      {isLoading ? (
        <div className="rounded-lg border border-[#ded6c9] bg-white p-5">
          Načítám...
        </div>
      ) : !isAuthenticated ? (
        <form
          className="rounded-lg border border-[#ded6c9] bg-white p-5 lg:col-span-2 lg:max-w-md"
          onSubmit={handleLogin}
        >
          <h2 className="text-xl font-semibold">Přihlášení uživatele</h2>
          <div className="mt-5 grid gap-3">
            <label className="field-label">
              Jméno
              <input
                className="field-input mt-1"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </label>
            <label className="field-label">
              Heslo
              <input
                className="field-input mt-1"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
          </div>
          {message ? <p className="mt-3 text-sm text-[#8c2f20]">{message}</p> : null}
          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76]"
            type="submit"
          >
            <LogIn size={17} />
            Přihlásit
          </button>
        </form>
      ) : (
        <>
          <section className="rounded-lg border border-[#ded6c9] bg-white p-5 lg:col-span-2">
            <div className="rounded-md border border-[#cde6d9] bg-[#eef8f2] p-4 text-sm text-[#245d3f]">
              <p className="font-semibold">Jsi přihlášen jako: {sessionUsername}</p>
              <p className="mt-1 text-[#5f716b]">
                Nové rezervace se zadávají přímo z hlavní stránky. Tady řešíš
                hlavně přehled, trenéry a případné opravy.
              </p>
            </div>

            <nav className="mt-4 grid gap-2 sm:grid-cols-3">
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#003758] px-3 text-center text-sm font-semibold text-white transition hover:bg-[#0b4d76]"
                href="#trenery"
              >
                Nastavení trenérů na tento týden
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#ded6c9] bg-[#fcfaf6] px-3 text-center text-sm font-semibold text-[#003758] transition hover:bg-[#f6f1e8]"
                href="#vsechny-akce"
              >
                Všechny akce
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#ded6c9] bg-[#fcfaf6] px-3 text-center text-sm font-semibold text-[#003758] transition hover:bg-[#f6f1e8]"
                href="#vraceni-akce"
              >
                Vrácení smazané akce
              </a>
            </nav>

            {message ? (
              <p className="mt-4 flex items-center gap-2 rounded-md border border-[#cde6d9] bg-[#f4fbf7] px-3 py-2 text-sm text-[#245d3f]">
                <Check size={16} />
                {message}
              </p>
            ) : null}
          </section>

          <section
            className="scroll-mt-4 rounded-lg border border-[#ded6c9] bg-white p-5"
            id="trenery"
          >
            <div>
              <h2 className="text-xl font-semibold">
                Trenéři nejbližších tréninků
              </h2>
              <p className="mt-1 text-sm text-[#66706f]">
                Změna se uloží jen pro nejbližší konkrétní termín daného
                tréninku, takže další týdny zůstanou bez zásahu.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              {recurringTrainerLabels.map((training) => {
                const booking = nextRecurringBookings.get(training.key);
                const isSaving = booking
                  ? savingTrainerBookingId === booking.id
                  : false;

                return (
                  <div
                    className="rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3"
                    key={training.key}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{training.label}</p>
                        <p className="text-xs text-[#66706f]">
                          {training.schedule}
                        </p>
                      </div>
                      {booking ? (
                        <span className="rounded-full bg-[#e7f1f6] px-2 py-1 text-xs font-semibold text-[#003758]">
                          {formatDateCz(booking.date)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#f6f1e8] px-2 py-1 text-xs font-semibold text-[#66706f]">
                          Bez termínu
                        </span>
                      )}
                    </div>

                    {booking ? (
                      <div className="mt-3 grid gap-2">
                        <p className="text-xs font-semibold text-[#43504f]">
                          {booking.start}-{booking.end} · {booking.title}
                        </p>
                        <select
                          className="field-input min-h-10"
                          disabled={isSaving}
                          onChange={(event) =>
                            handleAdminBookingTrainerChange(
                              booking.id,
                              event.target.value,
                            )
                          }
                          value={booking.trainer ?? ""}
                        >
                          <option value="">Bez trenéra</option>
                          {trainerOptions.map((trainer) => (
                            <option key={trainer} value={trainer}>
                              {trainer}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-[#66706f]">
                        V dostupném období není žádný automaticky vytvořený
                        termín tohoto tréninku.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="scroll-mt-4 overflow-hidden rounded-lg border border-[#ded6c9] bg-white"
            id="vsechny-akce"
          >
            <div className="border-b border-[#ded6c9] px-5 py-4">
              <h2 className="text-xl font-semibold">Všechny akce</h2>
              <p className="mt-1 text-sm text-[#66706f]">
                Zobrazeno {paginatedBookings.length} z {bookings.length} akcí.
              </p>
            </div>
            <div className="grid gap-3 p-3 md:hidden">
              {paginatedBookings.map((booking) => (
                <article
                  className="rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3"
                  key={booking.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {booking.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#66706f]">
                        {booking.organizer}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#e7f1f6] px-2 py-1 text-xs font-semibold text-[#003758]">
                      {formatBookingStatus(booking)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md border border-[#ece3d5] bg-white px-3 py-2">
                      <span className="block text-[11px] font-semibold uppercase text-[#66706f]">
                        Datum
                      </span>
                      <span className="mt-1 block font-semibold">
                        {formatDateCz(booking.date)}
                      </span>
                    </div>
                    <div className="rounded-md border border-[#ece3d5] bg-white px-3 py-2">
                      <span className="block text-[11px] font-semibold uppercase text-[#66706f]">
                        Čas
                      </span>
                      <span className="mt-1 block font-semibold">
                        {booking.start}-{booking.end}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <label className="field-label">
                      Trenér
                      <select
                        className="field-input mt-1 min-h-10"
                        disabled={savingTrainerBookingId === booking.id}
                        onChange={(event) =>
                          handleAdminBookingTrainerChange(
                            booking.id,
                            event.target.value,
                          )
                        }
                        value={booking.trainer ?? ""}
                      >
                        <option value="">Bez trenéra</option>
                        {trainerOptions.map((trainer) => (
                          <option key={trainer} value={trainer}>
                            {trainer}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center justify-between gap-3 text-xs text-[#66706f]">
                      <span>
                        Přidal:{" "}
                        <strong className="text-[#132935]">
                          {booking.createdBy ?? "neznámý"}
                        </strong>
                      </span>
                      {booking.cleanupRequired ? (
                        <span className="font-semibold text-[#8c2f20]">
                          {booking.cleanedAt ? "Uklizeno" : "Čeká na úklid"}
                        </span>
                      ) : null}
                    </div>

                    <button
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#edd3cc] bg-[#fff0eb] px-3 text-sm font-semibold text-[#8c2f20] transition hover:bg-[#ffe3da]"
                      onClick={() => handleDelete(booking.id)}
                      type="button"
                    >
                      <Trash2 size={15} />
                      Smazat
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-[#f6f1e8] text-xs uppercase text-[#66706f]">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-4 py-3">Čas</th>
                    <th className="px-4 py-3">Akce</th>
                    <th className="px-4 py-3">Přidal</th>
                    <th className="px-4 py-3">Stav</th>
                    <th className="px-4 py-3 text-right">Správa</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBookings.map((booking) => (
                    <tr className="border-t border-[#ece3d5]" key={booking.id}>
                      <td className="px-4 py-3 font-medium">
                        {formatDateCz(booking.date)}
                      </td>
                      <td className="px-4 py-3">
                        {booking.start}-{booking.end}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{booking.title}</p>
                        <p className="text-xs text-[#66706f]">
                          {booking.organizer}
                        </p>
                        <select
                          className="field-input mt-2 min-h-8 py-1 text-xs"
                          disabled={savingTrainerBookingId === booking.id}
                          onChange={(event) =>
                            handleAdminBookingTrainerChange(
                              booking.id,
                              event.target.value,
                            )
                          }
                          value={booking.trainer ?? ""}
                        >
                          <option value="">Bez trenéra</option>
                          {trainerOptions.map((trainer) => (
                            <option key={trainer} value={trainer}>
                              {trainer}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {booking.createdBy ?? "neznámý"}
                        </p>
                        {booking.updatedBy ? (
                          <p className="text-xs text-[#66706f]">
                            upravil {booking.updatedBy}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {formatBookingStatus(booking)}
                        {booking.cleanupRequired ? (
                          <span className="mt-1 block text-xs text-[#8c2f20]">
                            {booking.cleanedAt ? "Uklizeno" : "Čeká na úklid"}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <button
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#edd3cc] px-3 text-xs font-semibold text-[#8c2f20] transition hover:bg-[#fff0eb]"
                            onClick={() => handleDelete(booking.id)}
                            type="button"
                          >
                            <Trash2 size={15} />
                            Smazat
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#ece3d5] px-5 py-4 text-sm text-[#66706f] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Stránka {visibleBookingsPage} z {totalBookingPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="inline-flex h-9 items-center justify-center rounded-md border border-[#ded6c9] px-3 font-semibold text-[#003758] transition hover:bg-[#f6f1e8] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={visibleBookingsPage <= 1}
                  onClick={() =>
                    setBookingsPage((current) => Math.max(1, current - 1))
                  }
                  type="button"
                >
                  Předchozí
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-md border border-[#ded6c9] px-3 font-semibold text-[#003758] transition hover:bg-[#f6f1e8] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={visibleBookingsPage >= totalBookingPages}
                  onClick={() =>
                    setBookingsPage((current) =>
                      Math.min(totalBookingPages, current + 1),
                    )
                  }
                  type="button"
                >
                  Další
                </button>
              </div>
            </div>
          </section>

          {sessionUsername ? (
            <section
              className="scroll-mt-4 overflow-hidden rounded-lg border border-[#ded6c9] bg-white lg:col-span-2"
              id="vraceni-akce"
            >
              <div className="border-b border-[#ded6c9] px-5 py-4">
                <h2 className="text-xl font-semibold">
                  {sessionUsername === "kosis"
                    ? "Log operací"
                    : "Vrácení smazané akce"}
                </h2>
                <p className="mt-1 text-sm text-[#66706f]">
                  {sessionUsername === "kosis"
                    ? "Posledních 100 operací. Soubor logu se automaticky drží pod 100 MB."
                    : "Tady uvidíš jen akce, které jsi smazal. Jakmile termín proběhne, vrácení se schová."}
                </p>
              </div>
              <div className="divide-y divide-[#ece3d5]">
                {visibleAuditLog.length > 0 ? (
                  visibleAuditLog.map((entry) => (
                    <div
                      className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[170px_120px_1fr_auto] md:items-center"
                      key={`${entry.timestamp}-${entry.action}-${entry.bookingId}`}
                    >
                      <span className="text-[#66706f]">
                        {new Date(entry.timestamp).toLocaleString("cs-CZ")}
                      </span>
                      <span className="font-semibold">{entry.actor}</span>
                      <span>
                        {formatAuditAction(entry.action)}
                        {entry.details?.title ? `: ${entry.details.title}` : ""}
                        {entry.details?.date ? ` (${entry.details.date})` : ""}
                      </span>
                      {canUndoAuditEntry(entry, sessionUsername) ? (
                        <button
                          className="inline-flex h-9 items-center justify-center rounded-md border border-[#ded6c9] px-3 text-xs font-semibold text-[#003758] transition hover:bg-[#f6f1e8] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={undoingTimestamp === entry.timestamp}
                          onClick={() => handleUndoAuditEntry(entry)}
                          type="button"
                        >
                          {undoingTimestamp === entry.timestamp
                            ? "Vracím..."
                            : "Vrátit"}
                        </button>
                      ) : (
                        <span className="hidden text-xs text-[#9a9288] md:block">
                          -
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-4 text-sm text-[#66706f]">
                    {sessionUsername === "kosis"
                      ? "Zatím nejsou zaznamenané žádné operace."
                      : "Zatím nemáš žádnou smazanou akci k vrácení."}
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </SiteShell>
  );
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    "booking.clean": "potvrdil úklid",
    "booking.create": "vytvořil akci",
    "booking.delete": "smazal akci",
    "booking.undo": "vrátil operaci",
    "booking.update": "upravil akci",
  };

  return labels[action] ?? action;
}

function formatBookingStatus(booking: Booking) {
  if (booking.status === "maintenance") {
    return "Servis";
  }

  return "Obsazeno";
}

function formatDateCz(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
}

function canUndoAuditEntry(entry: AuditLogEntry, sessionUsername: string | null) {
  if (
    sessionUsername !== "kosis" &&
    (entry.action !== "booking.delete" || entry.actor !== sessionUsername)
  ) {
    return false;
  }

  if (entry.action === "booking.create") {
    return Boolean(entry.bookingId);
  }

  if (entry.action === "booking.delete") {
    return Boolean(
      entry.details?.booking &&
        entry.details.booking.date >= getTodayPragueDateKey(),
    );
  }

  if (entry.action === "booking.update" || entry.action === "booking.clean") {
    return Boolean(entry.details?.previousBooking);
  }

  return false;
}

function getTodayPragueDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Prague",
    year: "numeric",
  }).format(new Date());
}
