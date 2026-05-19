"use client";

import {
  CalendarPlus,
  Check,
  LogIn,
  LogOut,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SiteShell } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAdminSession, loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";
import { trainerOptions, type Booking, type BookingStatus } from "@/lib/schedule";

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

type BookingForm = {
  cleanupRequired: boolean;
  title: string;
  organizer: string;
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  note: string;
  trainer: string;
};

type RecurringTrainingLabel = {
  key: string;
  label: string;
  schedule: string;
};

type RecurringTrainerConfig = Record<string, string>;

const emptyForm: BookingForm = {
  cleanupRequired: false,
  title: "",
  organizer: "",
  date: new Date().toISOString().slice(0, 10),
  start: "16:00",
  end: "18:00",
  status: "confirmed",
  note: "",
  trainer: "",
};

export function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [recurringTrainerLabels, setRecurringTrainerLabels] = useState<
    RecurringTrainingLabel[]
  >([]);
  const [recurringTrainers, setRecurringTrainers] =
    useState<RecurringTrainerConfig>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingRecurringTrainers, setIsSavingRecurringTrainers] =
    useState(false);
  const [undoingTimestamp, setUndoingTimestamp] = useState("");
  const [message, setMessage] = useState("");
  const [recurringTrainerMessage, setRecurringTrainerMessage] = useState("");

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
    if (sessionUsername) {
      await loadAuditLog();
    }
  }, [loadAuditLog, sessionUsername]);

  const loadRecurringTrainers = useCallback(async () => {
    const response = await fetch("/api/recurring-trainers", { cache: "no-store" });

    if (!response.ok) {
      setRecurringTrainerLabels([]);
      setRecurringTrainers({});
      return;
    }

    const data = (await response.json()) as {
      labels: RecurringTrainingLabel[];
      trainers: RecurringTrainerConfig;
    };

    setRecurringTrainerLabels(data.labels);
    setRecurringTrainers(data.trainers);
  }, []);

  useEffect(() => {
    async function loadSession() {
      const session = await getAdminSession();
      setIsAuthenticated(session.authenticated);
      setSessionUsername(session.username ?? null);

      if (session.authenticated) {
        const bookingsResponse = await fetch("/api/bookings", {
          cache: "no-store",
        });

        if (bookingsResponse.ok) {
          const data = (await bookingsResponse.json()) as { bookings: Booking[] };
          setBookings(data.bookings);
        }

        if (session.username) {
          await loadAuditLog();
        }

        await loadRecurringTrainers();
      }

      setIsLoading(false);
    }

    void loadSession();
  }, [loadAuditLog, loadBookings, loadRecurringTrainers]);

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
    await loadBookings();
    await loadRecurringTrainers();
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
    setRecurringTrainers({});
    setMessage("");
  }

  async function handleRecurringTrainerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingRecurringTrainers(true);
    setRecurringTrainerMessage("");

    try {
      const response = await fetch("/api/recurring-trainers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainers: recurringTrainers }),
      });

      if (!response.ok) {
        setRecurringTrainerMessage("Trenéry se nepodařilo uložit.");
        return;
      }

      const data = (await response.json()) as {
        labels: RecurringTrainingLabel[];
        trainers: RecurringTrainerConfig;
      };

      setRecurringTrainerLabels(data.labels);
      setRecurringTrainers(data.trainers);
      setRecurringTrainerMessage("Trenéři pravidelných tréninků jsou uložení.");
      await loadBookings();
    } finally {
      setIsSavingRecurringTrainers(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const url = editingId ? `/api/bookings/${editingId}` : "/api/bookings";
    const response = await fetch(url, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (response.status === 409) {
      setMessage("V tomto čase už existuje jiná akce.");
      return;
    }

    if (!response.ok) {
      setMessage("Akci se nepodařilo uložit.");
      return;
    }

    setForm(emptyForm);
    setEditingId(null);
    setMessage("Akce je uložena.");
    await loadBookings();
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
      await loadBookings();
      await loadAuditLog();
    } finally {
      setUndoingTimestamp("");
    }
  }

  function editBooking(booking: Booking) {
    setEditingId(booking.id);
    setForm({
      title: booking.title,
      organizer: booking.organizer,
      date: booking.date,
      start: booking.start,
      end: booking.end,
      cleanupRequired: Boolean(booking.cleanupRequired),
      status: booking.status,
      note: booking.note ?? "",
      trainer: booking.trainer ?? "",
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
      contentClassName="grid gap-6 px-5 py-6 lg:grid-cols-[380px_1fr] lg:px-8"
      description="Přehled, editace a mazání rezervací uložených v databázi."
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
            <h2 className="text-xl font-semibold">Přihlášení správce</h2>
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
            <form
              className="rounded-lg border border-[#ded6c9] bg-white p-5"
              onSubmit={handleSubmit}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  {editingId ? "Upravit akci" : "Nová akce"}
                </h2>
                <CalendarPlus className="text-[#003758]" size={24} />
              </div>
              <div className="mt-5 grid gap-3">
                <label className="field-label">
                  Název
                  <input
                    className="field-input mt-1"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                        organizer: event.target.value,
                      }))
                    }
                    required
                    value={form.title}
                  />
                </label>
                <label className="field-label">
                  Pořadatel
                  <input
                    className="field-input mt-1"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        organizer: event.target.value,
                      }))
                    }
                    value={form.organizer}
                  />
                </label>
                <label className="field-label">
                  Datum
                  <input
                    className="field-input mt-1"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                    required
                    type="date"
                    value={form.date}
                  />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="field-label">
                    Od
                    <input
                      className="field-input mt-1"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          start: event.target.value,
                        }))
                      }
                      required
                      type="time"
                      value={form.start}
                    />
                  </label>
                  <label className="field-label">
                    Do
                    <input
                      className="field-input mt-1"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          end: event.target.value,
                        }))
                      }
                      required
                      type="time"
                      value={form.end}
                    />
                  </label>
                  <label className="field-label">
                    Stav
                    <select
                      className="field-input mt-1"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          status: event.target.value as BookingStatus,
                        }))
                      }
                      value={form.status}
                    >
                      <option value="confirmed">Obsazeno</option>
                      <option value="maintenance">Servis</option>
                    </select>
                  </label>
                </div>
                <label className="field-label">
                  Trenér
                  <select
                    className="field-input mt-1"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        trainer: event.target.value,
                      }))
                    }
                    value={form.trainer}
                  >
                    <option value="">Bez vybraného trenéra</option>
                    {trainerOptions.map((trainer) => (
                      <option key={trainer} value={trainer}>
                        {trainer}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Poznámka
                  <textarea
                    className="field-input mt-1 min-h-24 resize-none"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    value={form.note}
                  />
                </label>
                <label className="flex items-start gap-3 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3 text-sm font-semibold text-[#43504f]">
                  <input
                    checked={form.cleanupRequired}
                    className="mt-1 h-4 w-4 accent-[#003758]"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cleanupRequired: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>
                    Sál po akci nebude uklizený
                    <span className="mt-1 block text-xs font-medium text-[#66706f]">
                      Po konci akce zůstane sál blokován do potvrzení úklidu.
                    </span>
                  </span>
                </label>
              </div>
              {message ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-[#245d3f]">
                  <Check size={16} />
                  {message}
                </p>
              ) : null}
              <div className="mt-5 flex gap-3">
                <button
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76]"
                  type="submit"
                >
                  Uložit
                </button>
                {editingId ? (
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-md border border-[#ded6c9] px-4 text-sm font-semibold text-[#003758] transition hover:bg-[#f6f1e8]"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                    type="button"
                  >
                    Zrušit
                  </button>
                ) : null}
              </div>
            </form>

            <form
              className="rounded-lg border border-[#ded6c9] bg-white p-5"
              onSubmit={handleRecurringTrainerSubmit}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    Trenéři pravidelných tréninků
                  </h2>
                  <p className="mt-1 text-sm text-[#66706f]">
                    Trenér se propíše do všech budoucích automaticky vytvářených
                    termínů.
                  </p>
                </div>
                <CalendarPlus className="text-[#003758]" size={24} />
              </div>
              <div className="mt-5 grid gap-3">
                {recurringTrainerLabels.map((training) => (
                  <label
                    className="grid gap-2 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3 text-sm sm:grid-cols-[1fr_180px] sm:items-center"
                    key={training.key}
                  >
                    <span>
                      <span className="block font-semibold">{training.label}</span>
                      <span className="mt-0.5 block text-xs text-[#66706f]">
                        {training.schedule}
                      </span>
                    </span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setRecurringTrainers((current) => ({
                          ...current,
                          [training.key]: event.target.value,
                        }))
                      }
                      value={recurringTrainers[training.key] ?? ""}
                    >
                      <option value="">Bez trenéra</option>
                      {trainerOptions.map((trainer) => (
                        <option key={trainer} value={trainer}>
                          {trainer}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {recurringTrainerMessage ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-[#245d3f]">
                  <Check size={16} />
                  {recurringTrainerMessage}
                </p>
              ) : null}
              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSavingRecurringTrainers}
                type="submit"
              >
                {isSavingRecurringTrainers ? "Ukládám..." : "Uložit trenéry"}
              </button>
            </form>

            <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white lg:col-span-2">
              <div className="border-b border-[#ded6c9] px-5 py-4">
                <h2 className="text-xl font-semibold">Všechny akce</h2>
                <p className="mt-1 text-sm text-[#66706f]">
                  Tyto akce se propisuji do veřejné dostupnosti.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-[#f6f1e8] text-xs uppercase text-[#66706f]">
                    <tr>
                      <th className="px-4 py-3">Datum</th>
                      <th className="px-4 py-3">Čas</th>
                      <th className="px-4 py-3">Akce</th>
                      <th className="px-4 py-3">Přidal</th>
                      <th className="px-4 py-3">Stav</th>
                      <th className="px-4 py-3 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr className="border-t border-[#ece3d5]" key={booking.id}>
                        <td className="px-4 py-3 font-medium">{booking.date}</td>
                        <td className="px-4 py-3">
                          {booking.start}-{booking.end}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold">{booking.title}</p>
                          <p className="text-xs text-[#66706f]">
                            {booking.organizer}
                          </p>
                          {booking.trainer ? (
                            <p className="text-xs font-semibold text-[#003758]">
                              Trenér: {booking.trainer}
                            </p>
                          ) : null}
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
                          {booking.status === "maintenance"
                            ? "Servis"
                            : "Obsazeno"}
                          {booking.cleanupRequired ? (
                            <span className="mt-1 block text-xs text-[#8c2f20]">
                              {booking.cleanedAt
                                ? "Uklizeno"
                                : "Čeká na úklid"}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ded6c9] text-[#003758] transition hover:bg-[#f6f1e8]"
                              onClick={() => editBooking(booking)}
                              title="Upravit"
                              type="button"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#edd3cc] text-[#8c2f20] transition hover:bg-[#fff0eb]"
                              onClick={() => handleDelete(booking.id)}
                              title="Smazat"
                              type="button"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {sessionUsername ? (
              <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white lg:col-span-2">
                <div className="border-b border-[#ded6c9] px-5 py-4">
                  <h2 className="text-xl font-semibold">
                    {sessionUsername === "kosis" ? "Log operací" : "Moje smazané akce"}
                  </h2>
                  <p className="mt-1 text-sm text-[#66706f]">
                    {sessionUsername === "kosis"
                      ? "Posledních 100 operací. Soubor logu se automaticky drží pod 100 MB."
                      : "Tady můžeš vrátit akci, kterou jsi smazal omylem. Jakmile termín proběhne, vrácení se schová."}
                  </p>
                </div>
                <div className="divide-y divide-[#ece3d5]">
                  {auditLog.length > 0 ? (
                    auditLog.map((entry) => (
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
                      Zatím nejsou zaznamenané žádné operace.
                    </div>
                  )}
                </div>
              </div>
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
