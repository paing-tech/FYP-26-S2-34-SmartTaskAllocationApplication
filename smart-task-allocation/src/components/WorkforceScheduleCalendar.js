"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_STYLES = {
  scheduled: { label: "Scheduled", dot: "bg-blue-600", gradient: "linear-gradient(90deg, #2563EB, #60A5FA)", glow: "rgba(37,99,235,.48)" },
  present: { label: "Present", dot: "bg-emerald-600", gradient: "linear-gradient(90deg, #047857, #34D399)", glow: "rgba(4,120,87,.5)" },
  late: { label: "Late", dot: "bg-amber-500", gradient: "linear-gradient(90deg, #D97706, #FCD34D)", glow: "rgba(245,158,11,.5)" },
  absent: { label: "Absent", dot: "bg-red-700", gradient: "linear-gradient(90deg, #B91C1C, #F87171)", glow: "rgba(185,28,28,.5)" },
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hourLabel(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function timeToHour(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours + minutes / 60;
}

function formatTime(value) {
  const hour = timeToHour(value);
  if (hour == null) return "";
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  const displayHour = whole % 12 || 12;
  return `${displayHour}${minutes ? `:${pad(minutes)}` : ""}${whole < 12 ? "am" : "pm"}`;
}

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function shortLeaveDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function formatLeaveDates(values = []) {
  const dates = [...new Set(values)].sort();
  if (!dates.length) return "—";
  if (dates.length === 1) return shortLeaveDate(dates[0]);
  if (dates.length === 2) return `${shortLeaveDate(dates[0])} – ${shortLeaveDate(dates[1])}`;
  const finalParts = dates.at(-1).split("-").map(Number);
  const prefixDates = dates.slice(0, -1);
  const prefix = prefixDates.map((value, index) => {
    const [year, month, day] = value.split("-").map(Number);
    const next = (prefixDates[index + 1] || dates.at(-1)).split("-").map(Number);
    const showMonth = index === prefixDates.length - 1 || year !== next[0] || month !== next[1];
    const showYear = index === prefixDates.length - 1 || year !== finalParts[0];
    const monthLabel = new Date(year, month - 1, day).toLocaleDateString("en-GB", { month: "short" });
    return `${day}${showMonth ? ` ${monthLabel}` : ""}${showYear ? ` ${String(year).slice(-2)}` : ""}`;
  }).join(", ");
  return `${prefix} - ${shortLeaveDate(dates.at(-1))}`;
}

function leaveMonthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  return [...Array(firstDay).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
}

const LEAVE_STATUS_STYLES = {
  approved: "bg-emerald-700 text-white",
  rejected: "bg-red-700 text-white",
  pending: "bg-amber-500 text-white",
};

const LEAVE_FILTERS = [
  { id: "approved", label: "Approved", color: "#047857" },
  { id: "pending", label: "Pending", color: "#F59E0B" },
  { id: "rejected", label: "Rejected", color: "#B91C1C" },
];

function startOfWeek(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function scheduleStatus(schedule, attendance, now) {
  if (!schedule) return null;
  if (attendance?.clock_in_at) return Number(attendance.late_minutes || 0) > 0 ? "late" : "present";
  const [year, month, day] = schedule.work_date.split("-").map(Number);
  const endHour = timeToHour(schedule.end_time);
  const shiftEnd = new Date(year, month - 1, day, Math.floor(endHour), Math.round((endHour % 1) * 60));
  return now > shiftEnd ? "absent" : "scheduled";
}

const POLICY_FIELDS = [
  { key: "annualLeaveTotal", label: "Annual Leave Allowance (Days Per Year)", icon: "trip", endpoint: "/api/organization-leave-policy", min: 0 },
  { key: "sickLeaveTotal", label: "Sick Leave Allowance (Days Per Year)", icon: "health_cross", endpoint: "/api/organization-leave-policy", min: 0 },
  { key: "weeklyHourLimit", label: "Work Hour Limit (Hours Per Week)", icon: "work_history", endpoint: "/api/organization-work-policy", min: 1 },
  { key: "workloadTaskLimit", label: "Workload Limit (Tasks)", icon: "cases", endpoint: "/api/organization-workload-policy", min: 1 },
];

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function WorkforceScheduleCalendar() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [people, setPeople] = useState([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [policies, setPolicies] = useState({ annualLeaveTotal: "16", sickLeaveTotal: "14", weeklyHourLimit: "40", workloadTaskLimit: "8" });
  const [editingPolicy, setEditingPolicy] = useState("");
  const [policyError, setPolicyError] = useState("");
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveError, setLeaveError] = useState("");
  const [leaveAction, setLeaveAction] = useState("");
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);
  const [leaveCalendarMonth, setLeaveCalendarMonth] = useState(() => new Date());
  const [leaveSearch, setLeaveSearch] = useState("");
  const [leaveStatusFilters, setLeaveStatusFilters] = useState([]);
  const [leaveFilterOpen, setLeaveFilterOpen] = useState(false);
  const leaveFilterRef = useRef(null);
  const dateInputRef = useRef(null);
  const dateKey = dateString(selectedDate);
  const weekStartDate = startOfWeek(selectedDate);
  const weekStartKey = dateString(weekStartDate);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEndKey = dateString(weekEndDate);
  const departments = [...new Set(people.map((person) => person.departmentName))].sort((a, b) => a.localeCompare(b));
  const filteredPeople = people.filter((person) => {
    const matchesRole = roleFilter === "all" || person.role === roleFilter;
    const matchesDepartment = departmentFilter === "all" || person.departmentName === departmentFilter;
    const matchesSearch = person.fullName.toLowerCase().includes(search.trim().toLowerCase());
    return matchesRole && matchesDepartment && matchesSearch;
  });
  const presentCount = filteredPeople.filter((person) => Boolean(person.attendance?.clock_in_at)).length;
  const scheduledCount = filteredPeople.filter((person) => Boolean(person.schedule)).length;
  const normalizedLeaveSearch = leaveSearch.trim().toLowerCase();
  const filteredLeaveRequests = leaveRequests.filter((record) => {
    const status = String(record.status || "Pending").toLowerCase();
    if (leaveStatusFilters.length && !leaveStatusFilters.includes(status)) return false;
    if (!normalizedLeaveSearch) return true;
    return `${record.full_name || ""} ${formatLeaveDates(record.dates)} ${record.leave_type || ""} ${status} ${record.description || ""}`.toLowerCase().includes(normalizedLeaveSearch);
  });

  useEffect(() => {
    if (!leaveFilterOpen) return undefined;
    function closeFilter(event) {
      if (!leaveFilterRef.current?.contains(event.target)) setLeaveFilterOpen(false);
    }
    document.addEventListener("mousedown", closeFilter);
    return () => document.removeEventListener("mousedown", closeFilter);
  }, [leaveFilterOpen]);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setError("");
      try {
        const response = await fetch(`/api/useradmin/workforce-schedule?date=${dateKey}&weekStart=${weekStartKey}&weekEnd=${weekEndKey}`, { headers: await authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the workforce schedule.");
        if (!cancelled) setPeople(result.people ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [dateKey, weekEndKey, weekStartKey]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function loadLeaveRequests() {
    setLeaveError("");
    try {
      const response = await fetch("/api/useradmin/leave-requests", { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load leave requests.");
      setLeaveRequests(result.requests ?? []);
    } catch (loadError) {
      setLeaveError(loadError.message);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(loadLeaveRequests, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function updateLeaveStatus(leaveRequestId, status) {
    setLeaveAction(leaveRequestId);
    setLeaveError("");
    try {
      const response = await fetch("/api/useradmin/leave-requests", { method: "PATCH", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ leaveRequestId, status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update leave request.");
      await loadLeaveRequests();
    } catch (actionError) {
      setLeaveError(actionError.message);
    } finally {
      setLeaveAction("");
    }
  }

  function openLeaveDetails(record) {
    const firstDate = record.dates?.[0];
    if (firstDate) {
      const [year, month] = firstDate.split("-").map(Number);
      setLeaveCalendarMonth(new Date(year, month - 1, 1));
    }
    setSelectedLeaveRequest(record);
  }

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const headers = await authHeaders();
        const responses = await Promise.all([
          fetch("/api/organization-leave-policy", { headers }),
          fetch("/api/organization-work-policy", { headers }),
          fetch("/api/organization-workload-policy", { headers }),
        ]);
        const results = await Promise.all(responses.map((response) => response.json()));
        const failed = responses.findIndex((response) => !response.ok);
        if (failed >= 0) throw new Error(results[failed].error || "Could not load organization settings.");
        if (!cancelled) setPolicies({
          annualLeaveTotal: String(results[0].annualLeaveTotal ?? 16),
          sickLeaveTotal: String(results[0].sickLeaveTotal ?? 14),
          weeklyHourLimit: String(results[1].weeklyHourLimit ?? 40),
          workloadTaskLimit: String(results[2].workloadTaskLimit ?? 8),
        });
      } catch (loadError) {
        if (!cancelled) setPolicyError(loadError.message);
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  async function togglePolicyEdit(field) {
    if (editingPolicy !== field.key) {
      setEditingPolicy(field.key);
      return;
    }
    setPolicyError("");
    try {
      const body = field.endpoint === "/api/organization-leave-policy"
        ? { annualLeaveTotal: Number(policies.annualLeaveTotal), sickLeaveTotal: Number(policies.sickLeaveTotal) }
        : { [field.key]: Number(policies[field.key]) };
      const response = await fetch(field.endpoint, { method: "PATCH", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save organization settings.");
      setEditingPolicy("");
    } catch (saveError) {
      setPolicyError(saveError.message);
    }
  }

  function moveDate(amount) {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount);
      return next;
    });
  }

  return (
    <div className="relative h-full min-h-0">
      <div className="absolute left-[calc(15%+5.75rem)] top-0 z-30 flex h-11 -translate-x-1/2 items-center justify-center gap-7 text-sm font-black">
        <span className="flex items-center gap-1.5 text-blue-600" aria-label={`${scheduledCount} people scheduled`}><span className="material-symbols-outlined text-[30px]" aria-hidden="true">group</span>{scheduledCount}</span>
        <span className="flex items-center gap-1.5 text-emerald-700" aria-label={`${presentCount} people present`}><span className="material-symbols-outlined text-[30px]" aria-hidden="true">person_check</span>{presentCount}</span>
      </div>
      <div className="absolute left-[30%] right-0 top-0 z-30 flex h-11 items-center gap-2">
        <div className="relative h-11">
          <button type="button" onClick={() => setDepartmentOpen((open) => !open)} className="flex h-11 min-w-36 items-center justify-between gap-2 rounded-full border border-white/70 bg-white/35 px-4 text-xs font-bold text-[#0D1E4C] backdrop-blur-sm transition hover:bg-white/60">
            <span className="max-w-28 truncate">{departmentFilter === "all" ? "Department" : departmentFilter}</span>
            <span className="material-symbols-outlined text-lg">{departmentOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
          </button>
          {departmentOpen ? (
            <div className="absolute left-0 top-13 z-40 max-h-64 min-w-52 overflow-y-auto rounded-3xl border border-white/70 bg-white/70 p-2 shadow-xl backdrop-blur-xl">
              {["all", ...departments].map((department) => (
                <button key={department} type="button" onClick={() => { setDepartmentFilter(department); setDepartmentOpen(false); }} className={`block w-full rounded-full px-4 py-2 text-left text-xs font-bold transition hover:bg-white/70 ${departmentFilter === department ? "text-blue-700" : "text-[#0D1E4C]"}`}>
                  {department === "all" ? "All departments" : department}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex h-11 items-center rounded-full border border-white/70 bg-white/35 p-1 backdrop-blur-sm">
          {[{ id: "manager", label: "Managers" }, { id: "employee", label: "Employees" }].map((option) => (
            <button key={option.id} type="button" onClick={() => setRoleFilter((current) => current === option.id ? "all" : option.id)} className={`h-9 rounded-full px-4 text-xs font-bold transition ${roleFilter === option.id ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/60"}`}>
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex h-11 min-w-40 flex-1 items-center gap-2 rounded-full border border-white/70 bg-white/55 px-4 backdrop-blur-sm">
          <span className="material-symbols-outlined text-xl text-slate-500">search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[#0D1E4C] outline-none placeholder:text-slate-400" />
        </label>

        <div className="ml-auto flex h-11 shrink-0 items-center rounded-full border border-white/70 bg-white/35 p-1 backdrop-blur-sm">
        <button type="button" onClick={() => moveDate(-1)} aria-label="Previous day" className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/60"><span className="material-symbols-outlined">chevron_left</span></button>
        <button
          type="button"
          onClick={() => {
            const input = dateInputRef.current;
            if (!input) return;
            if (typeof input.showPicker === "function") input.showPicker();
            else input.click();
          }}
          className="flex h-9 min-w-32 items-center justify-center rounded-full px-3 text-sm font-black text-[#0D1E4C] transition hover:bg-white/60"
        >
          {selectedDate.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={dateKey}
          onChange={(event) => {
            if (!event.target.value) return;
            const [year, month, day] = event.target.value.split("-").map(Number);
            setSelectedDate(new Date(year, month - 1, day));
          }}
          aria-label="Jump to a date"
          className="pointer-events-none absolute h-px w-px opacity-0"
          tabIndex={-1}
        />
        <button type="button" onClick={() => moveDate(1)} aria-label="Next day" className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/60"><span className="material-symbols-outlined">chevron_right</span></button>
        </div>
      </div>

      <section className="absolute inset-x-0 bottom-[33%] top-14 flex min-h-0 flex-col overflow-hidden rounded-4xl border border-white/60 bg-white/20 backdrop-blur-xl">
        {error ? <p className="shrink-0 px-4 pt-2 text-xs font-bold text-red-600">{error}</p> : null}
        <div className="grid h-14 shrink-0 grid-cols-[30%_70%] bg-white/20 backdrop-blur-xl text-slate-700">
          <div className="flex items-center justify-center gap-3 border-r border-white/20 px-3">
            {Object.values(STATUS_STYLES).map((status) => <span key={status.label} className="flex items-center gap-1.5 text-xs font-bold text-[#0D1E4C]"><span className={`h-3 w-3 rounded-full ${status.dot}`} />{status.label}</span>)}
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {HOURS.map((hour) => <div key={hour} className="flex items-center justify-center truncate border-l border-white/15 text-[9px] font-bold first:border-l-0">{hourLabel(hour)}</div>)}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredPeople.map((person) => {
            const start = timeToHour(person.schedule?.start_time);
            const end = timeToHour(person.schedule?.end_time);
            const statusKey = scheduleStatus(person.schedule, person.attendance, now);
            const status = statusKey ? STATUS_STYLES[statusKey] : null;
            return (
              <div key={person.userId} className="grid h-20 grid-cols-[30%_70%] border-b border-[#D9E0E7] last:border-b-0">
                <div className="flex min-w-0 items-center gap-3 border-r border-[#D9E0E7] px-8">
                  {person.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-black text-[#0D1E4C]">{initials(person.fullName)}</span>}
                  <p className="truncate text-sm font-bold text-[#0D1E4C]">{person.fullName}</p>
                  <div className="ml-auto flex shrink-0 gap-1.5">
                    {WEEKDAYS.map((label, index) => {
                      const day = new Date(weekStartDate);
                      day.setDate(day.getDate() + index);
                      const item = person.week?.find((entry) => entry.work_date === dateString(day));
                      const dayStatus = scheduleStatus(item, item?.attendance, now);
                      return <span key={label} className="flex flex-col items-center gap-1.5 text-[9px] font-bold text-slate-500">{label}<span className={`h-3 w-3 rounded-full ${dayStatus ? STATUS_STYLES[dayStatus].dot : "bg-slate-300"}`} /></span>;
                    })}
                  </div>
                </div>
                <div className="relative min-w-0">
                  <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {HOURS.map((hour) => <div key={hour} className="border-l border-dashed border-slate-400/60 first:border-l-0" />)}
                  </div>
                  {start !== null && end !== null && end > start && status ? (
                    <div className="absolute top-1/2 z-10 flex h-10 -translate-y-1/2 items-center justify-center rounded-full px-3 text-[11px] font-black text-white" style={{ left: `${(start / 24) * 100}%`, width: `${((end - start) / 24) * 100}%`, backgroundImage: status.gradient, boxShadow: `0 0 16px 4px ${status.glow}` }}>
                      {formatTime(person.schedule.start_time)} – {formatTime(person.schedule.end_time)}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!filteredPeople.length ? <p className="p-6 text-center text-xs font-bold text-slate-400">No users match these filters.</p> : null}
        </div>
      </section>

      <div className="absolute inset-x-0 bottom-0 grid h-[30%] grid-cols-[3fr_2fr] gap-4">
        <section className="min-w-0 overflow-hidden rounded-4xl border border-white/60 bg-white/20 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 text-[#0D1E4C]">
            <div className="flex shrink-0 items-center gap-2"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14l8 4M16 14l-8 4"/></svg><h3 className="text-lg font-black">Leave Requests</h3></div>
            <div className="flex min-w-0 items-center gap-2">
              <label className="relative block w-72 max-w-full"><span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[22px] text-[#64748B]">search</span><input value={leaveSearch} onChange={(event) => setLeaveSearch(event.target.value)} placeholder="Search requests" className="h-11 w-full rounded-full border border-[#C7DDEB] bg-white pl-12 pr-5 text-base font-medium outline-none placeholder:text-[#64748B] focus:border-[#83A6CE] focus:ring-2 focus:ring-[#83A6CE]/25" /></label>
              <div ref={leaveFilterRef} className="relative">
                <button type="button" onClick={() => setLeaveFilterOpen((open) => !open)} aria-label="Filter leave requests" className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-white/70 backdrop-blur-xl transition hover:bg-white/60 ${leaveFilterOpen || leaveStatusFilters.length ? "bg-[#0D1E4C] text-white" : "bg-white/35 text-[#0D1E4C]"}`}><span className="material-symbols-outlined text-[19px]">filter_list</span>{leaveStatusFilters.length ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black text-white">{leaveStatusFilters.length}</span> : null}</button>
                {leaveFilterOpen ? <div className="absolute right-0 top-10 z-40 w-36 rounded-2xl border border-white/70 bg-white/70 p-2 backdrop-blur-3xl">{LEAVE_FILTERS.map((option) => { const checked = leaveStatusFilters.includes(option.id); return <button key={option.id} type="button" onClick={() => setLeaveStatusFilters((current) => checked ? current.filter((item) => item !== option.id) : [...current, option.id])} className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-xs font-bold hover:bg-white/70" style={{ color: option.color }}>{checked ? <span className="material-symbols-outlined text-[16px]">check_circle</span> : <span className="h-3.5 w-3.5 rounded-full border" style={{ borderColor: option.color }} />}{option.label}</button>; })}{leaveStatusFilters.length ? <button type="button" onClick={() => setLeaveStatusFilters([])} className="mt-1 w-full rounded-full px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-white/70">Clear filters</button> : null}</div> : null}
              </div>
            </div>
          </div>
          <div className="mt-2 max-h-[calc(100%-2rem)] overflow-y-auto overflow-x-hidden rounded-3xl bg-white/20">
            <table className="w-full table-fixed text-left text-[10px] text-[#0D1E4C]">
              <colgroup><col className="w-[15%]"/><col className="w-[24%]"/><col className="w-[10%]"/><col className="w-[12%]"/><col className="w-[15%]"/><col className="w-[11%]"/><col className="w-[13%]"/></colgroup>
              <thead className="sticky top-0 z-10 bg-white/20 uppercase tracking-wide backdrop-blur-xl">
                <tr>{["Name", "Dates", "Duration", "Leave Type", "Leave Balance", "Status", "Actions"].map((heading) => <th key={heading} className="px-1 py-2 text-[10px] font-black">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {filteredLeaveRequests.map((record) => {
                  const status = String(record.status || "Pending");
                  const pending = status.toLowerCase() === "pending";
                  return (
                    <tr key={record.leave_request_id} className="border-t border-white/50 text-[10px] font-bold">
                      <td className="truncate px-1 py-2 font-black">{record.full_name}</td>
                      <td className="whitespace-normal px-1 py-2 leading-3">{formatLeaveDates(record.dates)}</td>
                      <td className="px-1 py-2">{record.dates?.length ?? 0} {(record.dates?.length ?? 0) === 1 ? "day" : "days"}</td>
                      <td className="px-1 py-2 capitalize">{record.leave_type}</td>
                      <td className="px-1 py-2">{record.leave_balance} / {record.leave_allowance} days</td>
                      <td className="px-1 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${LEAVE_STATUS_STYLES[status.toLowerCase()] || "bg-slate-100 text-slate-600"}`}>{status}</span></td>
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openLeaveDetails(record)} aria-label="View leave request details" className="flex h-7 w-7 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/60"><span className="material-symbols-outlined text-[21px]" aria-hidden="true">description</span></button>
                          <button type="button" disabled={!pending || leaveAction === record.leave_request_id} onClick={() => updateLeaveStatus(record.leave_request_id, "Approved")} aria-label="Approve leave request" className="flex h-7 w-7 items-center justify-center rounded-full text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-25"><span className="material-symbols-outlined text-[21px]" aria-hidden="true">check_circle</span></button>
                          <button type="button" disabled={!pending || leaveAction === record.leave_request_id} onClick={() => updateLeaveStatus(record.leave_request_id, "Rejected")} aria-label="Reject leave request" className="flex h-7 w-7 items-center justify-center rounded-full text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-25"><span className="material-symbols-outlined text-[21px]" aria-hidden="true">cancel</span></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredLeaveRequests.length && !leaveError ? <p className="p-5 text-center text-xs font-bold text-slate-400">{leaveRequests.length ? "No matching leave requests." : "No leave requests."}</p> : null}
          </div>
          {leaveError ? <p className="mt-1 text-[10px] font-bold text-red-600">{leaveError}</p> : null}
        </section>
        <section className="overflow-hidden rounded-4xl border border-white/60 bg-white/20 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[#0D1E4C]"><span className="material-symbols-outlined text-[24px]" aria-hidden="true">settings</span><h3 className="text-lg font-black">Settings</h3></div>
          <div className="mt-2">
            {POLICY_FIELDS.map((field) => {
              const editing = editingPolicy === field.key;
              return (
                <div key={field.key} className="flex h-8 items-center gap-2.5 text-[#0D1E4C]">
                  <span className="material-symbols-outlined shrink-0 text-[18px] text-slate-500" aria-hidden="true">{field.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{field.label}</span>
                  <input type="number" min={field.min} value={policies[field.key]} disabled={!editing} onChange={(event) => setPolicies((current) => ({ ...current, [field.key]: event.target.value }))} className={`h-7 w-16 rounded-full border px-2 text-center text-[11px] font-black outline-none ${editing ? "border-blue-500 bg-white/70" : "border-white/60 bg-white/30"} disabled:opacity-100`} />
                  <button type="button" onClick={() => togglePolicyEdit(field)} aria-label={editing ? `Save ${field.label}` : `Edit ${field.label}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/60"><span className="material-symbols-outlined text-[17px]" aria-hidden="true">{editing ? "edit_off" : "edit"}</span></button>
                </div>
              );
            })}
          </div>
          {policyError ? <p className="mt-1 text-[10px] font-bold text-red-600">{policyError}</p> : null}
        </section>
      </div>
      {selectedLeaveRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLeaveRequest(null); }}>
          <section className="max-h-[90vh] w-full max-w-xs overflow-y-auto rounded-3xl bg-white/40 p-6 text-[#0D1E4C] shadow-xl backdrop-blur-sm">
            <div className="relative text-center"><p className="text-lg font-black">{selectedLeaveRequest.full_name}</p><p className="mt-1 text-sm font-bold capitalize text-slate-500">{selectedLeaveRequest.leave_type} leave</p><button type="button" onClick={() => setSelectedLeaveRequest(null)} className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/70" aria-label="Close details"><span className="material-symbols-outlined">close</span></button></div>
            <div className="mt-5">
              <div className="flex items-center justify-between"><button type="button" onClick={() => setLeaveCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/70" aria-label="Previous month"><span className="material-symbols-outlined">chevron_left</span></button><h4 className="text-base font-black">{leaveCalendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h4><button type="button" onClick={() => setLeaveCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/70" aria-label="Next month"><span className="material-symbols-outlined">chevron_right</span></button></div>
              <div className="mt-2 grid grid-cols-7 text-center text-xs font-black text-slate-400">{WEEKDAYS.map((day) => <span key={day} className="py-2">{day.slice(0, 2)}</span>)}</div>
              <div className="grid grid-cols-7 text-center text-sm font-bold">{leaveMonthDays(leaveCalendarMonth).map((day, index) => { const key = day ? dateString(new Date(leaveCalendarMonth.getFullYear(), leaveCalendarMonth.getMonth(), day)) : ""; const selected = selectedLeaveRequest.dates?.includes(key); return <span key={`${day}-${index}`} className="flex h-10 items-center justify-center"><span className={`flex h-9 w-9 items-center justify-center rounded-full ${selected ? "bg-[#0D1E4C] text-white" : ""}`}>{day}</span></span>; })}</div>
            </div>
            <div className="mt-5 text-center"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Reason</p><p className="mx-auto mt-2 max-w-[15rem] whitespace-pre-wrap break-words text-base">{selectedLeaveRequest.description || "No reason provided."}</p></div>
            {selectedLeaveRequest.certificate_url ? <a href={selectedLeaveRequest.certificate_url} target="_blank" rel="noreferrer" className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/70 bg-white/60 text-sm font-black transition hover:bg-white"><span className="material-symbols-outlined">attach_file</span>View Medical Certificate</a> : null}
            {String(selectedLeaveRequest.status || "Pending").toLowerCase() === "pending" ? <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={async () => { await updateLeaveStatus(selectedLeaveRequest.leave_request_id, "Approved"); setSelectedLeaveRequest(null); }} className="h-12 rounded-full bg-emerald-700 font-black text-white transition hover:bg-emerald-800">Approve</button><button type="button" onClick={async () => { await updateLeaveStatus(selectedLeaveRequest.leave_request_id, "Rejected"); setSelectedLeaveRequest(null); }} className="h-12 rounded-full border border-red-700 font-black text-red-700 transition hover:bg-red-700 hover:text-white">Reject</button></div> : <div className="mt-6 flex justify-center"><span className={`rounded-full px-4 py-2 text-sm font-black ${LEAVE_STATUS_STYLES[String(selectedLeaveRequest.status).toLowerCase()]}`}>{selectedLeaveRequest.status}</span></div>}
          </section>
        </div>
      ) : null}
    </div>
  );
}
