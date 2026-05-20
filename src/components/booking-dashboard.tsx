"use client";

import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cleanupCellStyle,
  dayFormatter,
  formatEventCount,
  getBookingCellStyle,
  getCurrentTimeOffset,
  getDayAvailabilitySegments,
  getMonthDays,
  getOccupancyNotice,
  getSegmentStyle,
  getSlotFill,
  getSlotStateKey,
  getWeekStartDate,
  isCountableEvent,
  isRecurringBookingId,
  longDateFormatter,
  monthLabelFormatter,
  scrollCurrentTimeIntoView,
  statusLabels,
  statusStyles,
  type SlotState,
} from "@/components/booking-dashboard-utils";
import {
  Field,
  MobileCalendarSummary,
  RecurringCancellationPanel,
} from "@/components/booking-dashboard-panels";
import { SiteShell } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import type { RecurringCancellationNotice } from "@/lib/bookings-db";
import {
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from "@/lib/admin-auth-client";
import {
  createTimeSlots,
  getOpeningHoursGroups,
  formatOpeningHoursForDate,
  formatDateKey,
  getPendingCleanupBooking,
  getWeekDays,
  hallSettings,
  isSlotBooked,
  isSlotOpen,
  trainerOptions,
  type Booking,
  type BookingRequest,
} from "@/lib/schedule";

const initialRequest: BookingRequest = {
  name: "",
  date: "2026-05-20",
  start: "16:00",
  end: "18:00",
  eventType: "tanecni-lekce",
  bookingKind: "hall",
  trainer: "",
  note: "",
  cleanupRequired: false,
};

const monthControlFormatter = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});
const weekControlFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});

type BookingDashboardProps = {
  initialBookings: Booking[];
  initialDate: string;
  initialRecurringCancellations: RecurringCancellationNotice[];
  initialSession: {
    authenticated: boolean;
    username: string | null;
  };
};

type AppMode = "hall" | "lessons";

export function BookingDashboard({
  initialBookings,
  initialDate,
  initialRecurringCancellations,
  initialSession,
}: BookingDashboardProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMode, setViewMode] = useState<"today" | "week" | "month">(
    "week",
  );
  const [request, setRequest] = useState({
    ...initialRequest,
    date: initialDate,
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(
    initialSession.authenticated,
  );
  const [sessionUsername, setSessionUsername] = useState(initialSession.username);
  const [appMode, setAppMode] = useState<AppMode>("hall");
  const [selectedLessonTrainer, setSelectedLessonTrainer] = useState("");
  const isCheckingSession = false;
  const [authError, setAuthError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [cleaningBookingId, setCleaningBookingId] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deletingBookingId, setDeletingBookingId] = useState("");
  const [reinstatingBookingId, setReinstatingBookingId] = useState("");
  const [savingTrainerBookingId, setSavingTrainerBookingId] = useState("");
  const [trainerMessage, setTrainerMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarBookings, setCalendarBookings] =
    useState<Booking[]>(initialBookings);
  const [recurringCancellations, setRecurringCancellations] = useState(
    initialRecurringCancellations,
  );
  const [now, setNow] = useState<Date | null>(null);
  const calendarScrollerRef = useRef<HTMLDivElement | null>(null);

  const canUseLessonMode =
    isAuthenticated &&
    ["kosis", "tkkoskovi"].includes(
      (sessionUsername ?? "").toLocaleLowerCase("cs-CZ"),
    );
  const activeAppMode: AppMode = canUseLessonMode ? appMode : "hall";
  const activeSlotMinutes =
    activeAppMode === "lessons" ? 45 : hallSettings.slotMinutes;
  const timeSlots = useMemo(
    () => createTimeSlots(activeSlotMinutes),
    [activeSlotMinutes],
  );
  const currentDateKey = now ? formatDateKey(now) : "";
  const currentTimeMinutes = now
    ? now.getHours() * 60 + now.getMinutes()
    : null;
  const todayDateKey = currentDateKey || initialDate;
  const selectedDateObject = useMemo(
    () => new Date(`${selectedDate}T12:00:00`),
    [selectedDate],
  );
  const days = useMemo(
    () => getWeekDays(getWeekStartDate(selectedDate)),
    [selectedDate],
  );
  const selectedMonthKey = `${selectedDate.slice(0, 7)}-01`;
  const monthDays = useMemo(
    () => getMonthDays(selectedMonthKey),
    [selectedMonthKey],
  );
  const hallBookings = useMemo(
    () =>
      calendarBookings.filter(
        (booking) => booking.bookingKind !== "individual-lesson",
      ),
    [calendarBookings],
  );
  const lessonBookings = useMemo(
    () =>
      calendarBookings.filter(
        (booking) => booking.bookingKind === "individual-lesson",
      ),
    [calendarBookings],
  );
  const activeModeBookings =
    activeAppMode === "lessons" ? lessonBookings : hallBookings;
  const selectedBookings = useMemo(
    () => activeModeBookings.filter((booking) => booking.date === selectedDate),
    [activeModeBookings, selectedDate],
  );
  const availableTrainers = useMemo(() => {
    const trainers = new Set(trainerOptions);

    for (const booking of calendarBookings) {
      if (booking.trainer) {
        trainers.add(booking.trainer);
      }
    }

    return [...trainers];
  }, [calendarBookings]);
  const activeLessonTrainer =
    availableTrainers.includes(selectedLessonTrainer)
      ? selectedLessonTrainer
      : availableTrainers[0] ?? "";
  const selectedTrainerWeekLessons = useMemo(() => {
    const weekDateKeys = new Set(days.map((day) => formatDateKey(day)));

    return lessonBookings
      .filter(
        (booking) =>
          booking.trainer === activeLessonTrainer &&
          weekDateKeys.has(booking.date),
      )
      .sort((left, right) =>
        `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
      );
  }, [activeLessonTrainer, days, lessonBookings]);
  const visibleDateKeys = useMemo(() => {
    const keys = new Set<string>([todayDateKey]);

    for (const day of days) {
      keys.add(formatDateKey(day));
    }

    for (const day of monthDays) {
      keys.add(formatDateKey(day));
    }

    return [...keys];
  }, [days, monthDays, todayDateKey]);
  const bookingDayCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const booking of activeModeBookings) {
      if (!isCountableEvent(booking)) {
        continue;
      }

      counts.set(booking.date, (counts.get(booking.date) ?? 0) + 1);
    }

    return counts;
  }, [activeModeBookings]);
  const weeklyEventCount = useMemo(() => {
    const weekDateKeys = new Set(days.map((day) => formatDateKey(day)));

    return activeModeBookings.filter(
      (booking) => weekDateKeys.has(booking.date) && isCountableEvent(booking),
    ).length;
  }, [activeModeBookings, days]);
  const slotStateMap = useMemo(() => {
    const states = new Map<string, SlotState>();

    for (const dateKey of visibleDateKeys) {
      const date = new Date(`${dateKey}T12:00:00`);

      for (const time of timeSlots) {
        const isOpen = isSlotOpen(date, time);
        const booking = isSlotBooked(
          activeModeBookings,
          dateKey,
          time,
          activeSlotMinutes,
        );
        const cleanupBooking =
          isOpen && !booking
            ? getPendingCleanupBooking(
                activeModeBookings,
                dateKey,
                time,
                activeSlotMinutes,
              )
            : undefined;

        states.set(getSlotStateKey(dateKey, time), {
          booking,
          cleanupBooking,
          isOpen,
        });
      }
    }

    return states;
  }, [activeModeBookings, activeSlotMinutes, timeSlots, visibleDateKeys]);
  const selectedDaySegments = useMemo(
    () =>
      getDayAvailabilitySegments(
        selectedDate,
        activeModeBookings,
        activeSlotMinutes,
      ),
    [activeModeBookings, activeSlotMinutes, selectedDate],
  );
  const freeSlots = useMemo(
    () => timeSlots.filter((time) => {
      const slotState = slotStateMap.get(getSlotStateKey(selectedDate, time));

      return Boolean(
        slotState?.isOpen && !slotState.booking && !slotState.cleanupBooking,
      );
    }),
    [selectedDate, slotStateMap, timeSlots],
  );
  const freeHours = freeSlots.length * (activeSlotMinutes / 60);
  const todaysOpeningHours = useMemo(
    () => formatOpeningHoursForDate(new Date()),
    [],
  );
  const openingHoursGroups = useMemo(() => getOpeningHoursGroups(), []);
  const occupancyNotice = useMemo(
    () => getOccupancyNotice(selectedBookings, selectedDate, now),
    [selectedBookings, selectedDate, now],
  );
  const getSlotState = (dateKey: string, time: string) =>
    slotStateMap.get(getSlotStateKey(dateKey, time)) ?? {
      booking: undefined,
      cleanupBooking: undefined,
      isOpen: false,
    };
  const getLessonSlotState = (trainer: string, dateKey: string, time: string) => {
    const date = new Date(`${dateKey}T12:00:00`);
    const isOpen = isSlotOpen(date, time);
    const hallBlocker = findOverlappingBooking(
      hallBookings,
      dateKey,
      time,
      activeSlotMinutes,
    );
    const trainerBooking = findOverlappingBooking(
      lessonBookings.filter((booking) => booking.trainer === trainer),
      dateKey,
      time,
      activeSlotMinutes,
    );

    return { hallBlocker, isOpen, trainerBooking };
  };

  const syncCalendar = useCallback(async () => {
    const response = await fetch("/api/availability", { cache: "no-store" });
    const data = (await response.json()) as {
      source: string;
      bookings: Booking[];
      recurringCancellations?: RecurringCancellationNotice[];
    };

    setCalendarBookings(data.bookings);
    setRecurringCancellations(data.recurringCancellations ?? []);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedDate(todayDateKey);
      setRequest((current) => ({ ...current, date: todayDateKey }));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [todayDateKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setNow(new Date()), 0);
    const interval = window.setInterval(() => setNow(new Date()), 30000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!currentDateKey) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      scrollCurrentTimeIntoView(calendarScrollerRef.current);
    });
    const timeout = window.setTimeout(() => {
      scrollCurrentTimeIntoView(calendarScrollerRef.current);
    }, 360);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [currentDateKey, selectedDate, viewMode]);

  useEffect(() => {
    function syncWhenVisible() {
      if (document.visibilityState === "visible") {
        void syncCalendar();
      }
    }

    const interval = window.setInterval(() => {
      void syncCalendar();
    }, 60000);

    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [syncCalendar]);

  function updateRequest(field: keyof BookingRequest, value: string) {
    setSubmitMessage("");
    setRequest((current) => ({ ...current, [field]: value }));
  }

  function updateCleanupRequired(value: boolean) {
    setSubmitMessage("");
    setRequest((current) => ({ ...current, cleanupRequired: value }));
  }

  function selectLessonSlot(trainer: string, dateKey: string, time: string) {
    setSubmitMessage("");
    setSelectedDate(dateKey);
    setRequest((current) => ({
      ...current,
      bookingKind: "individual-lesson",
      cleanupRequired: false,
      date: dateKey,
      end: addMinutesToTime(time, activeSlotMinutes),
      eventType: "tanecni-lekce",
      start: time,
      trainer,
    }));
  }

  function changeViewMode(nextViewMode: "today" | "week" | "month") {
    setViewMode(nextViewMode);

    if (nextViewMode === "today" || nextViewMode === "month") {
      setSelectedDate(todayDateKey);
      updateRequest("date", todayDateKey);
    }
  }

  function setCalendarDate(nextDateKey: string, shouldScrollToCurrentTime = false) {
    setSelectedDate(nextDateKey);
    setRequest((current) => ({ ...current, date: nextDateKey }));

    if (shouldScrollToCurrentTime) {
      window.setTimeout(() => {
        scrollCurrentTimeIntoView(calendarScrollerRef.current);
      }, 120);
    }
  }

  function changeDisplayedPeriod(offset: number) {
    setSelectedDate((currentDateKey) => {
      const currentDate = new Date(`${currentDateKey}T12:00:00`);

      if (viewMode === "month") {
        currentDate.setDate(1);
        currentDate.setMonth(currentDate.getMonth() + offset);
      } else if (viewMode === "week") {
        currentDate.setDate(currentDate.getDate() + offset * 7);
      } else {
        currentDate.setDate(currentDate.getDate() + offset);
      }

      const nextDateKey = formatDateKey(currentDate);
      setRequest((current) => ({ ...current, date: nextDateKey }));

      return nextDateKey;
    });
  }

  function showCurrentPeriod() {
    setCalendarDate(todayDateKey, true);
  }

  function getPeriodControlLabel() {
    if (viewMode === "month") {
      return monthControlFormatter.format(
        new Date(`${selectedMonthKey}T12:00:00`),
      );
    }

    if (viewMode === "week") {
      const weekStart = getWeekStartDate(selectedDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      return `${weekControlFormatter.format(weekStart)}-${weekControlFormatter.format(
        weekEnd,
      )}`;
    }

    return dayFormatter.format(selectedDateObject);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const submittedUsername = username.trim();

    try {
      await loginAdmin(username, password);
      const session = await getAdminSession();
      setSessionUsername(session.username ?? submittedUsername);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Přihlášení se nepodařilo.",
      );
      return;
    }

    setUsername("");
    setPassword("");
    setIsAuthenticated(true);
  }

  async function handleLogout() {
    await logoutAdmin();
    setIsAuthenticated(false);
    setSessionUsername(null);
    setSubmitMessage("");
  }

  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage("");

    try {
      const response = await fetch("/api/booking-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          bookingKind:
            activeAppMode === "lessons" ? "individual-lesson" : "hall",
        }),
      });

      if (response.status === 409) {
        setSubmitMessage("V tomto čase už existuje jiná akce.");
        return;
      }

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setSubmitMessage(data.message ?? "Rezervaci se nepodařilo uložit.");
        return;
      }

      const data = (await response.json()) as { booking?: Booking };

      if (data.booking) {
        setCalendarBookings((current) =>
          [...current.filter((booking) => booking.id !== data.booking?.id), data.booking]
            .filter((booking): booking is Booking => Boolean(booking))
            .sort((left, right) =>
              `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
            ),
        );
      }

      setSubmitMessage("Rezervace je uložena v databázi.");
      await syncCalendar();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMarkCleaned(bookingId: string) {
    setCleanupMessage("");
    setCleaningBookingId(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/clean`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setCleanupMessage(data.message ?? "Úklid se nepodařilo potvrdit.");
        return;
      }

      setCleanupMessage("Děkujeme, sál je označen jako uklizený.");
      await syncCalendar();
    } finally {
      setCleaningBookingId("");
    }
  }

  async function handleDeleteBooking(bookingId: string, title: string) {
    const isRecurringBooking = isRecurringBookingId(bookingId);
    const confirmMessage = isRecurringBooking
      ? `Opravdu zrušit jen tento termín "${title}"? Pravidelné tréninky v dalších týdnech zůstanou.`
      : `Opravdu smazat akci "${title}"?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeleteMessage("");
    setDeletingBookingId(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setDeleteMessage(data.message ?? "Akci se nepodařilo smazat.");
        return;
      }

      setDeleteMessage(
        isRecurringBooking
          ? "Tento termín pravidelné akce byl zrušen."
          : "Akce byla smazána.",
      );
      await syncCalendar();
    } finally {
      setDeletingBookingId("");
    }
  }

  async function handleReinstateRecurringBooking(bookingId: string) {
    setDeleteMessage("");
    setReinstatingBookingId(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/reinstate`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setDeleteMessage(data.message ?? "Termín se nepodařilo obnovit.");
        return;
      }

      setDeleteMessage("Pravidelný termín byl obnoven.");
      await syncCalendar();
    } finally {
      setReinstatingBookingId("");
    }
  }

  async function handleUpdateBookingTrainer(bookingId: string, trainer: string) {
    setTrainerMessage("");
    setSavingTrainerBookingId(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/trainer`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trainer }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setTrainerMessage(data.message ?? "Trenéra se nepodařilo uložit.");
        return;
      }

      setTrainerMessage(
        trainer ? "Trenér pro tento termín je uložený." : "Trenér byl odebraný.",
      );
      await syncCalendar();
    } finally {
      setSavingTrainerBookingId("");
    }
  }

  return (
    <SiteShell
      maxWidthClassName="max-w-[1840px]"
      contentClassName={`grid gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:pl-6 lg:pr-4 xl:pl-8 xl:pr-5 ${
        isAuthenticated
          ? "xl:grid-cols-[minmax(0,1fr)_minmax(560px,620px)] 2xl:grid-cols-[minmax(900px,1fr)_minmax(640px,760px)] 2xl:pl-12"
          : "xl:grid-cols-[minmax(0,1fr)_340px]"
      }`}
      description={
        <>
          Přehled dostupnosti pro lekce, workshopy a společenské akce Koškovi.
        </>
      }
      eyebrow={
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#d7e6ed]">
          <button
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
              activeAppMode === "hall"
                ? "border-white/35 bg-white/20 text-white"
                : "border-white/20 bg-white/10 hover:bg-white/15"
            }`}
            onClick={() => {
              setAppMode("hall");
              setRequest((current) => ({
                ...current,
                bookingKind: "hall",
              }));
            }}
            type="button"
          >
            <Sparkles size={15} />
            Rezervace sálu
          </button>
          {canUseLessonMode ? (
            <button
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                activeAppMode === "lessons"
                  ? "border-white/35 bg-white/20 text-white"
                  : "border-white/20 bg-white/10 hover:bg-white/15"
              }`}
              onClick={() => {
                setAppMode("lessons");
                setViewMode("week");
                setRequest((current) => ({
                  ...current,
                  bookingKind: "individual-lesson",
                  cleanupRequired: false,
                  eventType: "tanecni-lekce",
                  trainer: activeLessonTrainer,
                }));
              }}
              type="button"
            >
              <User size={15} />
              Individuální lekce
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <MapPin size={15} />
              {hallSettings.location}
            </span>
          )}
        </div>
      }
      infoPanel={{
        items: openingHoursGroups.map((group) => ({
          label: group.days,
          value: group.hours,
        })),
        sideContent: (
          <RecurringCancellationPanel
            cancellations={recurringCancellations}
            isAuthenticated={isAuthenticated}
            onReinstate={handleReinstateRecurringBooking}
            reinstatingId={reinstatingBookingId}
          />
        ),
        subtitle: "Pravidelný provoz sálu",
        title: "Otevírací doba",
      }}
      metrics={[
        {
          label: "Dnes volno",
          value: `${freeHours.toLocaleString("cs-CZ")} h`,
        },
        {
          label: "Dnes otevřeno",
          value: todaysOpeningHours,
        },
        ...(isAuthenticated
          ? [
              {
                label: "Tento týden",
                value: formatEventCount(weeklyEventCount),
              },
            ]
          : []),
      ]}
      title={
        activeAppMode === "lessons"
          ? "Dostupnost individuálních lekcí"
          : "Dostupnost tanečního sálu"
      }
    >
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-4 border-b border-[#ded6c9] pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {activeAppMode === "lessons"
                  ? `Individuální lekce - ${activeLessonTrainer}`
                  : viewMode === "today"
                  ? `Denní dostupnost - ${dayFormatter.format(selectedDateObject)}`
                  : viewMode === "week"
                    ? "Týdenní dostupnost"
                    : `Měsíční dostupnost - ${monthLabelFormatter.format(
                        new Date(`${selectedDate}T12:00:00`),
                      )}`}
              </h2>
              <p className="mt-1 text-sm text-[#66706f]">
                {activeAppMode === "lessons"
                  ? "Testovací režim pro individuální lekce používá stejné otevírací časy a 45minutové sloty."
                  : viewMode === "week"
                    ? "Kliknutím na den zobrazíš rychlý detail a volné časy."
                    : "Dny jsou pod sebou, časy najdeš v horní hlavičce tabulky."}
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              {activeAppMode === "hall" ? (
                <label className="mobile-view-select field-label">
                  Zobrazení
                  <select
                    className="field-input mt-1"
                    onChange={(event) => {
                      const nextViewMode = event.target.value as
                        | "today"
                        | "week"
                        | "month";

                      changeViewMode(nextViewMode);
                    }}
                    value={viewMode}
                  >
                    <option value="today">Den</option>
                    <option value="week">Týden</option>
                    <option value="month">Měsíc</option>
                  </select>
                </label>
              ) : null}

              {activeAppMode === "hall" ? (
                <div className="hidden h-10 overflow-hidden rounded-md border border-[#ded6c9] bg-white sm:inline-flex md:h-11">
                <button
                  className={`inline-flex items-center gap-1.5 px-2 text-xs font-semibold transition md:gap-2 md:px-3 md:text-sm ${
                    viewMode === "today"
                      ? "bg-[#003758] text-white"
                      : "text-[#35505b] hover:bg-[#f6f1e8]"
                  }`}
                  onClick={() => {
                    changeViewMode("today");
                  }}
                  type="button"
                >
                  <Clock3 size={16} />
                  Den
                </button>
                <button
                  className={`inline-flex items-center gap-1.5 border-l border-[#ded6c9] px-2 text-xs font-semibold transition md:gap-2 md:px-3 md:text-sm ${
                    viewMode === "week"
                      ? "bg-[#003758] text-white"
                      : "text-[#35505b] hover:bg-[#f6f1e8]"
                  }`}
                  onClick={() => changeViewMode("week")}
                  type="button"
                >
                  <CalendarDays size={16} />
                  Týden
                </button>
                <button
                  className={`inline-flex items-center gap-1.5 border-l border-[#ded6c9] px-2 text-xs font-semibold transition md:gap-2 md:px-3 md:text-sm ${
                    viewMode === "month"
                      ? "bg-[#003758] text-white"
                      : "text-[#35505b] hover:bg-[#f6f1e8]"
                  }`}
                  onClick={() => changeViewMode("month")}
                  type="button"
                >
                  <CalendarDays size={16} />
                  Měsíc
                </button>
                </div>
              ) : null}
              <div className="flex w-full items-center gap-3 sm:w-auto">
                <ThemeToggle />
                <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-[#ded6c9] bg-white sm:flex-none">
                  <button
                    aria-label={
                      viewMode === "month"
                        ? "Předchozí měsíc"
                        : viewMode === "week"
                          ? "Předchozí týden"
                          : "Předchozí den"
                    }
                    className="inline-flex h-11 w-10 shrink-0 items-center justify-center text-[#003758] transition hover:bg-[#f6f1e8]"
                    onClick={() => changeDisplayedPeriod(-1)}
                    type="button"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="inline-flex h-11 min-w-0 flex-1 items-center justify-center border-x border-[#ded6c9] px-3 text-sm font-semibold capitalize text-[#003758] transition hover:bg-[#f6f1e8] sm:min-w-36"
                    onClick={showCurrentPeriod}
                    type="button"
                  >
                    <span className="truncate">{getPeriodControlLabel()}</span>
                  </button>
                  <button
                    aria-label={
                      viewMode === "month"
                        ? "Další měsíc"
                        : viewMode === "week"
                          ? "Další týden"
                          : "Další den"
                    }
                    className="inline-flex h-11 w-10 shrink-0 items-center justify-center text-[#003758] transition hover:bg-[#f6f1e8]"
                    onClick={() => changeDisplayedPeriod(1)}
                    type="button"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          {isAuthenticated ? (
            <div className="rounded-md border border-[#ded6c9] bg-white px-3 py-2 text-sm text-[#66706f]">
                Jsi přihlášen jako: {sessionUsername ?? "uživatel"}
              <Link
                className="ml-3 inline-flex h-9 items-center justify-center rounded-md bg-[#003758] px-3 text-xs font-semibold text-white transition hover:bg-[#0b4d76]"
                href="/admin"
              >
                Otevřít správu
              </Link>
            </div>
          ) : null}

          {activeAppMode === "lessons" ? (
            <div className="calendar-view-transition grid gap-4 lg:hidden">
              <div className="rounded-lg border border-[#ded6c9] bg-white p-3">
                <p className="px-1 text-xs font-semibold uppercase text-[#66706f]">
                  Trenéři
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {availableTrainers.map((trainer) => {
                    const isActive = trainer === activeLessonTrainer;
                    const lessonCount = lessonBookings.filter(
                      (booking) =>
                        booking.trainer === trainer &&
                        days.some((day) => formatDateKey(day) === booking.date),
                    ).length;

                    return (
                      <button
                        className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${
                          isActive
                            ? "border-[#0b4d76] bg-[#003758] text-white shadow-[0_10px_20px_rgba(0,55,88,0.20)]"
                            : "border-[#ded6c9] bg-[#fcfaf6] text-[#35505b] hover:bg-[#eef7fb]"
                        }`}
                        key={trainer}
                        onClick={() => {
                          setSelectedLessonTrainer(trainer);
                          setRequest((current) => ({
                            ...current,
                            bookingKind: "individual-lesson",
                            trainer,
                          }));
                        }}
                        type="button"
                      >
                        <span className="block">{trainer}</span>
                        <span
                          className={`mt-1 block text-xs font-medium ${
                            isActive ? "text-[#d7e6ed]" : "text-[#66706f]"
                          }`}
                        >
                          {formatEventCount(lessonCount)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-[#ded6c9] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#66706f]">
                      Lekce trenéra
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">
                      {activeLessonTrainer}
                    </h3>
                  </div>
                  <span className="rounded-full bg-[#e7f1f6] px-3 py-1 text-xs font-semibold text-[#003758]">
                    {formatEventCount(selectedTrainerWeekLessons.length)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  {selectedTrainerWeekLessons.length > 0 ? (
                    selectedTrainerWeekLessons.map((booking) => (
                      <article
                        className="rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3"
                        key={booking.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold capitalize text-[#66706f]">
                              {longDateFormatter.format(
                                new Date(`${booking.date}T12:00:00`),
                              )}
                            </p>
                            <h4 className="mt-1 truncate text-lg font-semibold">
                              {booking.title}
                            </h4>
                            <p className="mt-0.5 text-sm text-[#66706f]">
                              {booking.organizer}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-[#eef8f2] px-2 py-1 text-xs font-semibold text-[#246043]">
                            {booking.start}-{booking.end}
                          </span>
                        </div>
                        {booking.note ? (
                          <p className="mt-3 rounded-md border border-[#ece3d5] bg-white px-3 py-2 text-xs text-[#66706f]">
                            {booking.note}
                          </p>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-md border border-[#d8eadf] bg-[#f3fbf5] p-4 text-sm text-[#246043]">
                      Tento trenér nemá v zobrazeném týdnu žádné individuální lekce.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {activeAppMode === "lessons" ? (
            <div className="calendar-view-transition hidden gap-4 lg:grid lg:grid-cols-[176px_minmax(0,1fr)]">
              <div className="rounded-lg border border-[#ded6c9] bg-white p-3">
                <p className="px-1 text-xs font-semibold uppercase text-[#66706f]">
                  Trenéři
                </p>
                <div className="mt-3 grid gap-2 lg:grid-cols-1">
                  {availableTrainers.map((trainer) => {
                    const isActive = trainer === activeLessonTrainer;
                    const lessonCount = lessonBookings.filter(
                      (booking) =>
                        booking.trainer === trainer &&
                        days.some((day) => formatDateKey(day) === booking.date),
                    ).length;

                    return (
                      <button
                        className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${
                          isActive
                            ? "border-[#0b4d76] bg-[#003758] text-white shadow-[0_10px_20px_rgba(0,55,88,0.20)]"
                            : "border-[#ded6c9] bg-[#fcfaf6] text-[#35505b] hover:bg-[#eef7fb]"
                        }`}
                        key={trainer}
                        onClick={() => {
                          setSelectedLessonTrainer(trainer);
                          setRequest((current) => ({
                            ...current,
                            bookingKind: "individual-lesson",
                            trainer,
                          }));
                        }}
                        type="button"
                      >
                        <span className="block">{trainer}</span>
                        <span
                          className={`mt-1 block text-xs font-medium ${
                            isActive ? "text-[#d7e6ed]" : "text-[#66706f]"
                          }`}
                        >
                          {formatEventCount(lessonCount)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
                <div
                  className="max-h-[min(760px,calc(100svh-112px))] max-w-full overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"
                  ref={calendarScrollerRef}
                >
                  <div className="min-w-full">
                    <div className="sticky top-0 z-30 grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm xl:grid-cols-[72px_repeat(7,minmax(0,1fr))]">
                      <div className="sticky left-0 z-40 bg-[#f6f1e8] px-2 py-2.5 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
                        Čas
                      </div>
                      {days.map((day) => {
                        const dateKey = formatDateKey(day);
                        const isSelected = dateKey === selectedDate;
                        const trainerDayCount = lessonBookings.filter(
                          (booking) =>
                            booking.trainer === activeLessonTrainer &&
                            booking.date === dateKey,
                        ).length;

                        return (
                          <button
                            className={`min-w-0 border-l px-1.5 py-2.5 text-left transition xl:px-2 ${
                              isSelected
                                ? "selected-period-head relative z-20 border-[#0b4d76] bg-[#0b4d76] text-white ring-1 ring-white/50 shadow-[0_14px_26px_rgba(0,55,88,0.30),inset_0_-5px_0_#8fd7ac]"
                                : "border-[#ded6c9] hover:bg-[#fbf8f1]"
                            }`}
                            key={dateKey}
                            onClick={() => setCalendarDate(dateKey)}
                            type="button"
                          >
                            <span className="block truncate text-xs font-semibold capitalize xl:text-sm">
                              {dayFormatter.format(day)}
                            </span>
                            <span
                              className={`mt-1 block truncate text-[11px] xl:text-xs ${
                                isSelected ? "text-[#d7e6ed]" : "text-[#66706f]"
                              }`}
                            >
                              {formatEventCount(trainerDayCount)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {timeSlots.map((time) => (
                      <div
                        className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-[#ece3d5] last:border-b-0 xl:grid-cols-[72px_repeat(7,minmax(0,1fr))]"
                        key={time}
                      >
                        <div className="sticky left-0 z-20 bg-[#fcfaf6] px-2 py-2 text-[11px] font-medium text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.06)] xl:text-xs">
                          {time}
                        </div>
                        {days.map((day) => {
                          const dateKey = formatDateKey(day);
                          const isSelectedDay = dateKey === selectedDate;
                          const { hallBlocker, isOpen, trainerBooking } =
                            getLessonSlotState(activeLessonTrainer, dateKey, time);
                          const isSelectedSlot =
                            request.bookingKind === "individual-lesson" &&
                            request.date === dateKey &&
                            request.start === time &&
                            request.trainer === activeLessonTrainer;
                          const isFree = isOpen && !hallBlocker && !trainerBooking;
                          const currentTimeOffset =
                            dateKey === currentDateKey && currentTimeMinutes !== null
                              ? getCurrentTimeOffset(
                                  day,
                                  time,
                                  currentTimeMinutes,
                                  activeSlotMinutes,
                                )
                              : null;

                          return (
                            <button
                              className={`relative min-h-12 border-l border-[#ece3d5] px-1.5 py-1.5 text-left text-[11px] transition xl:px-2 xl:text-xs ${
                                !isOpen
                                  ? isSelectedDay
                                    ? "selected-period-closed relative z-10 bg-[#e3edf3] text-[#6c747b] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18)]"
                                    : "bg-[#f3f0ea] text-[#9a9288]"
                                  : hallBlocker
                                    ? "bg-[#fff0eb] text-[#8c2f20]"
                                    : trainerBooking
                                      ? "bg-[#fce9e3] text-[#8c2f20]"
                                      : isSelectedSlot || isSelectedDay
                                        ? "selected-period-cell relative z-10 bg-[#eef7fb] text-[#17475f] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18)] hover:bg-[#e5f2f8]"
                                        : "bg-white text-[#246043] hover:bg-[#eef8f2]"
                              }`}
                              disabled={!isFree}
                              key={`${dateKey}-${time}`}
                              onClick={() =>
                                selectLessonSlot(activeLessonTrainer, dateKey, time)
                              }
                              title={
                                hallBlocker
                                  ? `Sál blokuje ${hallBlocker.title} (${hallBlocker.start}-${hallBlocker.end})`
                                  : trainerBooking
                                    ? `${trainerBooking.title} (${trainerBooking.start}-${trainerBooking.end})`
                                    : undefined
                              }
                              type="button"
                            >
                              {currentTimeOffset !== null ? (
                                <span
                                  aria-hidden="true"
                                  className="current-time-marker pointer-events-none absolute left-0 right-0 flex items-center"
                                  style={{ top: `${currentTimeOffset}%` }}
                                >
                                  <span className="time-marker-dot h-2 w-2 -translate-x-1 rounded-full bg-[#0b4d76] shadow-[0_0_0_3px_rgba(143,215,172,0.55)]" />
                                  <span className="time-marker-line h-[2px] flex-1 bg-[#0b4d76] shadow-[0_1px_4px_rgba(0,55,88,0.35)]" />
                                </span>
                              ) : null}
                              {!isOpen ? (
                                <span className="font-semibold">Zavřeno</span>
                              ) : hallBlocker ? (
                                <span className="relative z-10 block max-w-full overflow-hidden">
                                  <span className="block truncate font-semibold">
                                    Sál obsazený
                                  </span>
                                  <span className="mt-0.5 block truncate">
                                    {hallBlocker.title}
                                  </span>
                                </span>
                              ) : trainerBooking ? (
                                <span className="relative z-10 block max-w-full overflow-hidden">
                                  <span className="block truncate font-semibold">
                                    {trainerBooking.title}
                                  </span>
                                  <span className="mt-0.5 block truncate">
                                    {trainerBooking.start}-{trainerBooking.end}
                                  </span>
                                </span>
                              ) : (
                                <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-[#edf7ef] px-2 py-1 font-medium text-[#246043]">
                                  <Check size={13} />
                                  Volno
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeAppMode === "hall" ? (
          <div className="calendar-view-transition lg:hidden" key={`mobile-${viewMode}`}>
            <MobileCalendarSummary
              bookingDayCounts={bookingDayCounts}
              days={viewMode === "month" ? monthDays : days}
              onSelectDate={(dateKey) => {
                setSelectedDate(dateKey);
                updateRequest("date", dateKey);
              }}
              selectedDate={selectedDate}
              viewMode={viewMode}
            />
          </div>
          ) : null}

          {activeAppMode === "hall" ? (
          <div className="calendar-view-transition hidden lg:block" key={`desktop-${viewMode}`}>
          {viewMode === "today" ? (
            <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
              <div
                data-calendar-view="today"
                className="max-h-[min(760px,calc(100svh-112px))] max-w-full overflow-auto overscroll-contain"
                ref={calendarScrollerRef}
              >
                <div className="min-w-[420px]">
                  <div className="sticky top-0 z-20 grid grid-cols-[88px_minmax(220px,1fr)] border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm">
                    <div className="sticky left-0 z-30 bg-[#f6f1e8] px-3 py-3 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
                      Cas
                    </div>
                    <button
                      className="selected-period-head relative z-20 border-l border-[#0b4d76] bg-[#0b4d76] px-3 py-3 text-left text-white ring-1 ring-white/50 shadow-[0_14px_26px_rgba(0,55,88,0.30),inset_0_-5px_0_#8fd7ac]"
                      onClick={() => {
                        updateRequest("date", selectedDate);
                      }}
                      type="button"
                    >
                      <span className="block text-sm font-semibold capitalize">
                        {dayFormatter.format(selectedDateObject)}
                      </span>
                      <span className="mt-1 block text-xs text-[#d7e6ed]">
                        {formatEventCount(bookingDayCounts.get(selectedDate) ?? 0)}
                      </span>
                    </button>
                  </div>

                  {timeSlots.map((time) => {
                    const { booking, cleanupBooking, isOpen } = getSlotState(
                      selectedDate,
                      time,
                    );
                    const slotFill = getSlotFill(
                      time,
                      booking,
                      cleanupBooking,
                      activeSlotMinutes,
                    );
                    const currentTimeOffset =
                      selectedDate === currentDateKey && currentTimeMinutes !== null
                        ? getCurrentTimeOffset(
                            selectedDateObject,
                            time,
                            currentTimeMinutes,
                            activeSlotMinutes,
                          )
                        : null;

                    return (
                      <div
                        className="grid grid-cols-[88px_minmax(220px,1fr)] border-b border-[#ece3d5] last:border-b-0"
                        key={time}
                      >
                        <div className="sticky left-0 z-10 bg-[#fcfaf6] px-3 py-3 text-sm font-medium text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.06)]">
                          {time}
                        </div>
                        <button
                          className={`relative min-h-14 border-l border-[#ece3d5] px-2 py-2 text-left text-xs transition ${
                            !isOpen
                              ? "selected-period-closed relative z-10 bg-[#e3edf3] text-[#6c747b] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.75),inset_0_-3px_0_rgba(11,77,118,0.14)]"
                              : booking
                                ? `${getBookingCellStyle(booking, slotFill, true)} selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(11,77,118,0.14)]`
                                : cleanupBooking
                                  ? `${cleanupCellStyle} selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#e1b554] shadow-[0_9px_18px_rgba(106,75,0,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(106,75,0,0.12)]`
                                  : "selected-period-cell relative z-10 bg-[#eef7fb] text-[#17475f] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.78),inset_0_-3px_0_rgba(11,77,118,0.14)] hover:bg-[#e5f2f8]"
                          }`}
                          data-current-slot={
                            currentTimeOffset !== null ? "true" : undefined
                          }
                          onClick={() => {
                            if (isOpen && !booking && !cleanupBooking) {
                              updateRequest("date", selectedDate);
                              updateRequest("start", time);
                            }
                          }}
                          title={
                            booking
                              ? `${booking.title} (${booking.start}-${booking.end})`
                              : cleanupBooking
                                ? `Čeká na úklid po akci ${cleanupBooking.title}`
                              : undefined
                          }
                          type="button"
                        >
                          {slotFill ? (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute bottom-0 top-0 z-0 ${slotFill.className}`}
                              style={{
                                left: `${slotFill.left}%`,
                                width: `${slotFill.width}%`,
                              }}
                            />
                          ) : null}
                          {currentTimeOffset !== null ? (
                            <span
                              aria-hidden="true"
                              className="current-time-marker pointer-events-none absolute left-0 right-0 flex items-center"
                              style={{ top: `${currentTimeOffset}%` }}
                            >
                              <span className="time-marker-dot h-2 w-2 -translate-x-1 rounded-full bg-[#0b4d76] shadow-[0_0_0_3px_rgba(143,215,172,0.55)]" />
                              <span className="time-marker-line h-[2px] flex-1 bg-[#0b4d76] shadow-[0_1px_4px_rgba(0,55,88,0.35)]" />
                            </span>
                          ) : null}
                          {!isOpen ? (
                            <span className="block font-medium">Zavřeno</span>
                          ) : booking ? (
                            <span className="relative z-10 block max-w-full overflow-hidden">
                              <span className="block truncate font-semibold">
                                {statusLabels[booking.status]}
                              </span>
                              <span className="mt-1 block max-w-full truncate leading-4">
                                {booking.title}
                              </span>
                            </span>
                          ) : cleanupBooking ? (
                            <span className="relative z-10 block max-w-full overflow-hidden">
                              <span className="block truncate font-semibold">
                                Čeká na úklid
                              </span>
                              <span className="mt-1 block max-w-full truncate leading-4">
                                Po akci {cleanupBooking.title}
                              </span>
                            </span>
                          ) : (
                            <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-[#edf7ef] px-2 py-1 font-medium text-[#246043]">
                              <Check size={13} />
                              Volno
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : viewMode === "week" ? (
            <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
              <div
                data-calendar-view="week"
                className="max-h-[min(760px,calc(100svh-112px))] max-w-full overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"
                ref={calendarScrollerRef}
              >
                <div className="min-w-full">
                  <div className="sticky top-0 z-20 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm xl:grid-cols-[64px_repeat(7,minmax(0,1fr))]">
                    <div className="sticky left-0 z-30 bg-[#f6f1e8] px-2 py-2.5 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
                      Cas
                    </div>
                    {days.map((day) => {
                      const key = formatDateKey(day);
                      const isSelected = key === selectedDate;
                      return (
                        <button
                          className={`min-w-0 border-l px-1.5 py-2.5 text-left transition xl:px-2 ${
                            isSelected
                              ? "selected-period-head relative z-20 border-[#0b4d76] bg-[#0b4d76] text-white ring-1 ring-white/50 shadow-[0_14px_26px_rgba(0,55,88,0.30),inset_0_-5px_0_#8fd7ac]"
                              : "border-[#ded6c9] hover:bg-[#fbf8f1]"
                          }`}
                          key={key}
                          onClick={() => {
                            setSelectedDate(key);
                            updateRequest("date", key);
                          }}
                          type="button"
                        >
                          <span className="block truncate text-xs font-semibold capitalize xl:text-sm">
                            {dayFormatter.format(day)}
                          </span>
                          <span
                            className={`mt-1 block truncate text-[11px] xl:text-xs ${
                              isSelected ? "text-[#d7e6ed]" : "text-[#66706f]"
                            }`}
                          >
                            {formatEventCount(bookingDayCounts.get(key) ?? 0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {timeSlots.map((time) => (
                    <div
                      className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[#ece3d5] last:border-b-0 xl:grid-cols-[64px_repeat(7,minmax(0,1fr))]"
                      key={time}
                    >
                      <div className="sticky left-0 z-10 bg-[#fcfaf6] px-1.5 py-2 text-[11px] font-medium text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.06)] xl:px-2 xl:text-xs">
                        {time}
                      </div>
                      {days.map((day) => {
                        const dateKey = formatDateKey(day);
                        const isSelected = dateKey === selectedDate;
                        const { booking, cleanupBooking, isOpen } =
                          getSlotState(dateKey, time);
                        const slotFill = getSlotFill(
                          time,
                          booking,
                          cleanupBooking,
                          activeSlotMinutes,
                        );
                        const currentTimeOffset =
                          dateKey === currentDateKey && currentTimeMinutes !== null
                            ? getCurrentTimeOffset(
                                day,
                                time,
                                currentTimeMinutes,
                                activeSlotMinutes,
                              )
                            : null;
                        return (
                          <button
                            className={`relative min-h-12 border-l border-[#ece3d5] px-1.5 py-1.5 text-left text-[11px] transition xl:px-2 xl:text-xs ${
                              !isOpen
                                ? isSelected
                                  ? "selected-period-closed relative z-10 bg-[#e3edf3] text-[#6c747b] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.75),inset_0_-3px_0_rgba(11,77,118,0.14)]"
                                  : "bg-[#f3f0ea] text-[#9a9288]"
                                  : booking
                                    ? `${getBookingCellStyle(booking, slotFill, isSelected)} ${
                                        isSelected
                                          ? "selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(11,77,118,0.14)]"
                                          : ""
                                      }`
                                    : cleanupBooking
                                      ? `${cleanupCellStyle} ${
                                          isSelected
                                            ? "selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#e1b554] shadow-[0_9px_18px_rgba(106,75,0,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(106,75,0,0.12)]"
                                            : ""
                                        }`
                                  : isSelected
                                    ? "selected-period-cell relative z-10 bg-[#eef7fb] text-[#17475f] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.78),inset_0_-3px_0_rgba(11,77,118,0.14)] hover:bg-[#e5f2f8]"
                                    : "bg-white text-[#51615f] hover:bg-[#eef8f2]"
                            }`}
                            key={`${dateKey}-${time}`}
                            onClick={() => {
                              setSelectedDate(dateKey);
                              if (isOpen && !booking && !cleanupBooking) {
                                updateRequest("date", dateKey);
                                updateRequest("start", time);
                              }
                            }}
                            title={
                              booking
                                ? `${booking.title} (${booking.start}-${booking.end})`
                                : cleanupBooking
                                  ? `Čeká na úklid po akci ${cleanupBooking.title}`
                                : undefined
                            }
                            data-current-slot={
                              currentTimeOffset !== null ? "true" : undefined
                            }
                            type="button"
                          >
                            {slotFill ? (
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none absolute bottom-0 top-0 z-0 ${slotFill.className}`}
                                style={{
                                  left: `${slotFill.left}%`,
                                  width: `${slotFill.width}%`,
                                }}
                              />
                            ) : null}
                            {currentTimeOffset !== null ? (
                              <span
                                aria-hidden="true"
                                className="current-time-marker pointer-events-none absolute left-0 right-0 flex items-center"
                                style={{ top: `${currentTimeOffset}%` }}
                              >
                                <span className="time-marker-dot h-2 w-2 -translate-x-1 rounded-full bg-[#0b4d76] shadow-[0_0_0_3px_rgba(143,215,172,0.55)]" />
                                <span className="time-marker-line h-[2px] flex-1 bg-[#0b4d76] shadow-[0_1px_4px_rgba(0,55,88,0.35)]" />
                              </span>
                            ) : null}
                            {!isOpen ? (
                              <span className="block font-medium">Zavřeno</span>
                            ) : booking ? (
                              <span className="relative z-10 block max-w-full overflow-hidden">
                                <span className="block truncate font-semibold">
                                  {statusLabels[booking.status]}
                                </span>
                                <span className="mt-1 block max-w-full truncate leading-4">
                                  {booking.title}
                                </span>
                              </span>
                            ) : cleanupBooking ? (
                              <span className="relative z-10 block max-w-full overflow-hidden">
                                <span className="block truncate font-semibold">
                                  Čeká na úklid
                                </span>
                                <span className="mt-1 block max-w-full truncate leading-4">
                                  Po akci {cleanupBooking.title}
                                </span>
                              </span>
                            ) : (
                              <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-[#edf7ef] px-2 py-1 font-medium text-[#246043]">
                                <Check size={13} />
                                Volno
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
              <div
                data-calendar-view="month"
                className="max-h-[min(760px,calc(100svh-112px))] max-w-full overflow-auto overscroll-contain"
                ref={calendarScrollerRef}
              >
                <div className="min-w-[1720px]">
                  <div
                    className="sticky top-0 z-[80] grid border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm"
                    style={{
                      gridTemplateColumns: `128px repeat(${timeSlots.length}, minmax(86px, 1fr))`,
                    }}
                  >
                    <div className="sticky left-0 z-[90] bg-[#f6f1e8] px-3 py-3 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
                      Den
                    </div>
                    {timeSlots.map((time) => (
                      <div
                        className="bg-[#f6f1e8] px-2 py-3 text-center text-xs font-semibold text-[#66706f] shadow-[inset_1px_0_0_#ded6c9]"
                        key={time}
                      >
                        {time}
                      </div>
                    ))}
                  </div>

                  {monthDays.map((day) => {
                    const dateKey = formatDateKey(day);
                    const isSelected = dateKey === selectedDate;
                    const bookingCount = bookingDayCounts.get(dateKey) ?? 0;

                    return (
                      <div
                        className="grid min-h-16 border-b border-[#ece3d5] last:border-b-0"
                        key={dateKey}
                        style={{
                          gridTemplateColumns: `128px repeat(${timeSlots.length}, minmax(86px, 1fr))`,
                        }}
                      >
                        <button
                          className={`sticky left-0 z-40 min-h-16 border-r border-[#ece3d5] px-3 py-2 text-left transition ${
                            isSelected
                              ? "selected-period-head z-50 border-r-[#0b4d76] bg-[#0b4d76] text-white ring-1 ring-white/50 shadow-[0_14px_26px_rgba(0,55,88,0.32),inset_-5px_0_0_#8fd7ac]"
                              : "bg-[#fcfaf6] text-[#132935] shadow-[4px_0_10px_rgba(19,41,53,0.06)] hover:bg-[#fbf8f1]"
                          }`}
                          onClick={() => {
                            setSelectedDate(dateKey);
                            updateRequest("date", dateKey);
                          }}
                          type="button"
                        >
                          <span className="block text-sm font-semibold capitalize">
                            {dayFormatter.format(day)}
                          </span>
                          <span
                            className={`mt-1 block text-xs ${
                              isSelected ? "text-[#d7e6ed]" : "text-[#66706f]"
                            }`}
                          >
                            {formatEventCount(bookingCount)}
                          </span>
                        </button>

                        {timeSlots.map((time) => {
                          const { booking, cleanupBooking, isOpen } =
                            getSlotState(dateKey, time);
                          const slotFill = getSlotFill(
                            time,
                            booking,
                            cleanupBooking,
                            activeSlotMinutes,
                          );
                          const currentTimeOffset =
                            dateKey === currentDateKey &&
                            currentTimeMinutes !== null
                              ? getCurrentTimeOffset(
                                  day,
                                  time,
                                  currentTimeMinutes,
                                  activeSlotMinutes,
                                )
                              : null;

                          return (
                            <button
                              className={`relative min-h-16 border-l border-[#ece3d5] px-1.5 py-3 text-left text-[11px] transition ${
                                !isOpen
                                  ? isSelected
                                    ? "selected-period-closed relative z-10 bg-[#e3edf3] text-[#6c747b] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.75),inset_0_-3px_0_rgba(11,77,118,0.14)]"
                                    : "bg-[#f3f0ea] text-[#9a9288]"
                                    : booking
                                      ? `${getBookingCellStyle(booking, slotFill, isSelected)} ${
                                          isSelected
                                            ? "selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(11,77,118,0.14)]"
                                            : ""
                                        }`
                                      : cleanupBooking
                                        ? `${cleanupCellStyle} ${
                                            isSelected
                                              ? "selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#e1b554] shadow-[0_9px_18px_rgba(106,75,0,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(106,75,0,0.12)]"
                                              : ""
                                          }`
                                    : isSelected
                                      ? "selected-period-cell relative z-10 bg-[#eef7fb] text-[#17475f] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.78),inset_0_-3px_0_rgba(11,77,118,0.14)] hover:bg-[#e5f2f8]"
                                      : "bg-white text-[#51615f] hover:bg-[#eef8f2]"
                              }`}
                              key={`${dateKey}-${time}`}
                              onClick={() => {
                                setSelectedDate(dateKey);
                                if (isOpen && !booking && !cleanupBooking) {
                                  updateRequest("date", dateKey);
                                  updateRequest("start", time);
                                }
                              }}
                              title={
                                booking
                                  ? `${booking.title} (${booking.start}-${booking.end})`
                                  : cleanupBooking
                                    ? `Čeká na úklid po akci ${cleanupBooking.title}`
                                  : undefined
                              }
                              data-current-slot={
                                currentTimeOffset !== null ? "true" : undefined
                              }
                              type="button"
                            >
                              {slotFill ? (
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none absolute bottom-0 top-0 z-0 ${slotFill.className}`}
                                  style={{
                                    left: `${slotFill.left}%`,
                                    width: `${slotFill.width}%`,
                                  }}
                                />
                              ) : null}
                              {currentTimeOffset !== null ? (
                                <span
                                  aria-hidden="true"
                                  className="current-time-marker pointer-events-none absolute bottom-0 top-0 flex flex-col items-center"
                                  style={{ left: `${currentTimeOffset}%` }}
                                >
                                  <span className="time-marker-dot h-2 w-2 -translate-y-1 rounded-full bg-[#0b4d76] shadow-[0_0_0_3px_rgba(143,215,172,0.55)]" />
                                  <span className="time-marker-line w-[2px] flex-1 bg-[#0b4d76] shadow-[1px_0_4px_rgba(0,55,88,0.35)]" />
                                </span>
                              ) : null}
                              {!isOpen ? (
                                <span className="block truncate font-medium">
                                  Zavřeno
                                </span>
                              ) : booking ? (
                                <span className="relative z-10 block max-w-full overflow-hidden">
                                  <span className="block truncate font-semibold">
                                    {booking.title}
                                  </span>
                                  <span className="mt-0.5 block truncate">
                                    {booking.start}-{booking.end}
                                  </span>
                                </span>
                              ) : cleanupBooking ? (
                                <span className="relative z-10 block max-w-full overflow-hidden">
                                  <span className="block truncate font-semibold">
                                    Čeká na úklid
                                  </span>
                                  <span className="mt-0.5 block truncate">
                                    Po akci
                                  </span>
                                </span>
                              ) : (
                                <span className="relative z-10 block truncate font-medium text-[#246043]">
                                  Volno
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          </div>
          ) : null}
        </div>

        <aside className={`flex flex-col gap-5 lg:max-h-[min(760px,calc(100svh-112px))] lg:overflow-y-auto lg:pr-1 ${
          isAuthenticated ? "xl:grid xl:max-h-none xl:grid-cols-[minmax(360px,1fr)_minmax(220px,260px)] xl:items-start xl:overflow-visible xl:pr-0 2xl:grid-cols-[minmax(420px,1fr)_minmax(260px,320px)]" : ""
        }`}>
          <div className={`rounded-lg border border-[#ded6c9] bg-white p-5 ${
            isAuthenticated ? "lg:order-2" : "lg:order-1"
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#66706f]">
                  Vybraný den
                </p>
                <h2 className="mt-1 text-2xl font-semibold capitalize">
                  {longDateFormatter.format(new Date(`${selectedDate}T12:00:00`))}
                </h2>
              </div>
              <Image
                alt=""
                className="h-auto w-12"
                height={62}
                src="/brand/Koskovi_logo_znak.svg"
                width={71}
              />
            </div>

            {occupancyNotice ? (
              <div className="mt-5 rounded-md border border-[#c7dce7] bg-[#eef7fb] p-3 text-sm text-[#17475f] shadow-[0_8px_18px_rgba(0,55,88,0.08)]">
                <p className="flex items-center gap-2 font-semibold">
                  <Clock3 size={16} />
                  {occupancyNotice.title}
                </p>
                <p className="mt-1 text-xs text-[#4f6a76]">
                  {occupancyNotice.description}
                </p>
              </div>
            ) : null}

            <div className="mt-5 space-y-2">
              {selectedDaySegments.map((segment) => (
                <div
                  className={`grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    segment.kind === "free"
                      ? "border-[#d8eadf] bg-[#f3fbf5] text-[#246043]"
                      : segment.kind === "closed"
                        ? "border-[#e7dfd4] bg-[#f3f0ea] text-[#66706f]"
                        : getSegmentStyle(segment)
                  }`}
                  key={`${segment.kind}-${segment.start}-${segment.end}-${segment.title}`}
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-semibold text-xs sm:text-sm">
                    <Clock3 size={14} />
                    {segment.start}-{segment.end}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {segment.title}
                    </span>
                    {segment.description ? (
                      <span className="mt-0.5 block truncate text-xs opacity-80">
                        {segment.description}
                      </span>
                    ) : null}
                    {isAuthenticated && segment.kind === "booked" ? (
                      <label className="mt-2 block text-xs font-semibold">
                        Trenér
                        <select
                          className="field-input mt-1 min-h-8 w-full py-1 text-xs"
                          disabled={savingTrainerBookingId === segment.bookingId}
                          onChange={(event) =>
                            handleUpdateBookingTrainer(
                              segment.bookingId,
                              event.target.value,
                            )
                          }
                          value={segment.trainer ?? ""}
                        >
                          <option value="">Bez trenéra</option>
                          {availableTrainers.map((trainer) => (
                            <option key={trainer} value={trainer}>
                              {trainer}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {segment.kind === "cleanup" && segment.cleanupBookingId ? (
                      <button
                        className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#003758] px-3 text-xs font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={cleaningBookingId === segment.cleanupBookingId}
                        onClick={() =>
                          segment.cleanupBookingId
                            ? handleMarkCleaned(segment.cleanupBookingId)
                            : undefined
                        }
                        type="button"
                      >
                        <Check size={13} />
                        {cleaningBookingId === segment.cleanupBookingId
                          ? "Potvrzuji..."
                          : "Uklidil jsem sál"}
                      </button>
                    ) : null}
                    {isAuthenticated &&
                    segment.kind === "booked" ? (
                      <button
                        className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#d9a093] bg-[#fff0eb] px-2.5 py-1.5 text-xs font-semibold text-[#8c2f20] transition hover:bg-[#ffe3da] disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={deletingBookingId === segment.bookingId}
                        onClick={() =>
                          handleDeleteBooking(segment.bookingId, segment.title)
                        }
                        type="button"
                      >
                        <Trash2 size={13} />
                        {deletingBookingId === segment.bookingId
                          ? "Mazu..."
                          : isRecurringBookingId(segment.bookingId)
                            ? "Zrušit tento termín"
                            : "Smazat akci"}
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            {cleanupMessage ? (
              <p className="mt-3 rounded-md border border-[#dfc36b] bg-[#fff6d8] px-3 py-2 text-xs font-semibold text-[#5e4300]">
              {cleanupMessage}
            </p>
          ) : null}

            {deleteMessage ? (
              <p className="mt-3 rounded-md border border-[#edd3cc] bg-[#fff0eb] px-3 py-2 text-xs font-semibold text-[#8c2f20]">
                {deleteMessage}
              </p>
            ) : null}

            {trainerMessage ? (
              <p className="mt-3 rounded-md border border-[#cbe3d1] bg-[#f1faf2] px-3 py-2 text-xs font-semibold text-[#245d3f]">
                {trainerMessage}
              </p>
            ) : null}

            {false ? (
              <div className="hidden">
              {selectedBookings.length > 0 ? (
                selectedBookings.map((booking) => (
                  <div
                    className="rounded-md border border-[#e7dfd4] bg-[#fcfaf6] p-3"
                    key={booking.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{booking.title}</p>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                          statusStyles[booking.status]
                        }`}
                      >
                        {statusLabels[booking.status]}
                      </span>
                    </div>
                    <p className="mt-2 flex items-center gap-2 text-sm text-[#66706f]">
                      <Clock3 size={15} />
                      {booking.start}-{booking.end}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-[#66706f]">
                      <User size={15} />
                      {booking.organizer}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-[#d8eadf] bg-[#f3fbf5] p-4 text-sm text-[#246043]">
                  Celý den je zatím volný.
                </div>
              )}
              </div>
            ) : null}
          </div>

          <div className={`rounded-lg border border-[#ded6c9] bg-white p-5 ${
            isAuthenticated ? "lg:order-1" : "lg:order-2"
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {activeAppMode === "lessons"
                    ? "Rezervace individuální lekce"
                    : "Rezervace sálu"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#66706f]">
                  Vkládání rezervací je dostupné jen po přihlášení oprávněného uživatele.
                </p>
              </div>
              <LockKeyhole className="text-[#003758]" size={24} />
            </div>

            {isCheckingSession ? (
              <div className="mt-5 rounded-md border border-[#e7dfd4] bg-[#fcfaf6] p-3 text-sm text-[#66706f]">
                Kontroluji přihlášení...
              </div>
            ) : isAuthenticated ? (
              <form className="mt-5" onSubmit={handleBookingSubmit}>
                <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[#d8eadf] bg-[#f3fbf5] p-3 text-sm text-[#245d3f]">
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck size={17} />
                    Jsi přihlášen jako: {sessionUsername ?? "uživatel"}
                  </span>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#c9ded0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#245d3f] transition hover:bg-[#eef8f2]"
                    onClick={handleLogout}
                    type="button"
                  >
                    <LogOut size={14} />
                    Odhlásit
                  </button>
                </div>

                <div className="grid gap-3">
                  <Field
                    icon={<User size={16} />}
                    label={
                      activeAppMode === "lessons"
                        ? "Taneční pár"
                        : "Název / pořadatel"
                    }
                  >
                    <input
                      className="field-input"
                      onChange={(event) =>
                        updateRequest("name", event.target.value)
                      }
                      placeholder={
                        activeAppMode === "lessons"
                          ? "Jména tanečního páru"
                          : "Kurz, workshop nebo jmeno poradatele"
                      }
                      required
                      value={request.name}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="field-label col-span-2">
                      Datum
                      <input
                        className="field-input mt-1"
                        onChange={(event) =>
                          updateRequest("date", event.target.value)
                        }
                        required
                        type="date"
                        value={request.date}
                      />
                    </label>
                    <label className="field-label">
                      Od
                      <input
                        className="field-input mt-1"
                        onChange={(event) =>
                          updateRequest("start", event.target.value)
                        }
                        required
                        type="time"
                        value={request.start}
                      />
                    </label>
                    <label className="field-label">
                      Do
                      <input
                        className="field-input mt-1"
                        onChange={(event) =>
                          updateRequest("end", event.target.value)
                        }
                        required
                        type="time"
                        value={request.end}
                      />
                    </label>
                    {activeAppMode === "hall" ? (
                      <label className="field-label col-span-2">
                        Typ
                        <select
                          className="field-input mt-1"
                          onChange={(event) =>
                            updateRequest("eventType", event.target.value)
                          }
                          value={request.eventType}
                        >
                          <option value="tanecni-lekce">Lekce</option>
                          <option value="workshop">Seminář</option>
                          <option value="spolecenska-akce">Akce na sále</option>
                          <option value="blokace">Blokace</option>
                        </select>
                      </label>
                    ) : (
                      <div className="col-span-2 rounded-md border border-[#ded6c9] bg-[#fcfaf6] px-3 py-2 text-sm font-semibold text-[#43504f]">
                        Individuální lekce · sloty po 45 minutách
                      </div>
                    )}
                    {request.eventType === "tanecni-lekce" ||
                    activeAppMode === "lessons" ? (
                      <label className="field-label col-span-2">
                        Trenér
                        <select
                          className="field-input mt-1"
                          onChange={(event) => {
                            updateRequest("trainer", event.target.value);
                            if (activeAppMode === "lessons") {
                              setSelectedLessonTrainer(event.target.value);
                            }
                          }}
                          required={activeAppMode === "lessons"}
                          value={request.trainer}
                        >
                          <option value="">Bez vybraného trenéra</option>
                          {availableTrainers.map((trainer) => (
                            <option key={trainer} value={trainer}>
                              {trainer}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <label className="field-label">
                    Poznámka
                    <textarea
                      className="field-input mt-1 min-h-24 resize-none"
                      onChange={(event) =>
                        updateRequest("note", event.target.value)
                      }
                      placeholder="Počet lidí, příprava sálu, technika..."
                      value={request.note}
                    />
                  </label>

                  {activeAppMode === "hall" ? (
                  <label className="flex items-start gap-3 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3 text-sm font-semibold text-[#43504f]">
                    <input
                      checked={Boolean(request.cleanupRequired)}
                      className="mt-1 h-4 w-4 accent-[#003758]"
                      onChange={(event) =>
                        updateCleanupRequired(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      Sál po akci bude potřeba uklidit
                      <span className="mt-1 block text-xs font-medium text-[#66706f]">
                        Po konci akce se místo volna ukáže čekání na úklid,
                        dokud ho někdo nepotvrdí.
                      </span>
                    </span>
                  </label>
                  ) : null}
                </div>

                {submitMessage ? (
                  <div className="mt-4 flex items-start gap-3 rounded-md border border-[#cbe3d1] bg-[#f1faf2] p-3 text-sm text-[#245d3f]">
                    <ShieldCheck size={18} />
                    {submitMessage}
                  </div>
                ) : null}

                <button
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isSubmitting}
                  type="submit"
                >
                  <Send size={17} />
                  {isSubmitting ? "Ukládám..." : "Uložit rezervaci"}
                </button>
              </form>
            ) : (
              <form className="mt-5 space-y-3" onSubmit={handleLogin}>
                <label className="field-label">
                  Jméno uživatele
                  <input
                    className="field-input mt-1"
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Jméno uživatele"
                    required
                    value={username}
                  />
                </label>
                <label className="field-label">
                  Heslo
                  <input
                    className="field-input mt-1"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Zadej heslo"
                    required
                    type="password"
                    value={password}
                  />
                </label>

                {authError ? (
                  <div className="flex items-start gap-2 rounded-md border border-[#edd3cc] bg-[#fff0eb] p-3 text-sm text-[#8c2f20]">
                    <AlertCircle size={17} />
                    {authError}
                  </div>
                ) : null}

                <button
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76]"
                  type="submit"
                >
                  <LogIn size={17} />
                  Přihlásit
                </button>
              </form>
            )}
          </div>
        </aside>
    </SiteShell>
  );
}

function findOverlappingBooking(
  bookingList: Booking[],
  date: string,
  time: string,
  slotMinutes: number,
) {
  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + slotMinutes;

  return bookingList.find((booking) => {
    if (booking.date !== date) {
      return false;
    }

    return timeToMinutes(booking.start) < slotEnd && timeToMinutes(booking.end) > slotStart;
  });
}

function addMinutesToTime(time: string, minutesToAdd: number) {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
