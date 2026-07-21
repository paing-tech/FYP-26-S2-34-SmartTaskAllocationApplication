"use client";

import { useState } from "react";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateStr(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Multi-select month calendar — clicking a day toggles it in/out of the
// selection instead of picking a single date. Used both for creating a leave
// request and for editing one's dates afterward.
export default function LeaveDatePicker({ selectedDates, onToggleDate }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((year) => year - 1);
      setViewMonth(11);
    } else {
      setViewMonth((month) => month - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 11) {
      setViewYear((year) => year + 1);
      setViewMonth(0);
    } else {
      setViewMonth((month) => month + 1);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/70"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            chevron_left
          </span>
        </button>
        <p className="text-sm font-black text-[#0D1E4C]">{monthLabel(viewYear, viewMonth)}</p>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-white/70"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-[#94a3b8]">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} />;
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const isSelected = selectedDates.has(dateStr);

          return (
            <button
              type="button"
              key={dateStr}
              onClick={() => onToggleDate(dateStr)}
              className={`flex h-8 items-center justify-center rounded-full text-xs font-bold transition ${
                isSelected ? "bg-[#0D1E4C] text-white" : "text-[#0D1E4C] hover:bg-white/70"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
