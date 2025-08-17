import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// Daily Activity Planner — single-file React component
// Features:
// - Realtime countdown to next activity
// - Calculates free/active time remaining before the next Sleep activity
// - Vertical 24h calendar with draggable-now indicator and colored activity blocks
// - Add / Edit / Remove activities with validation
// - Responsive, keyboard-friendly UI; data persisted in localStorage
// - Optional category color-coding with sensible defaults

// ---------- Utilities ----------
const pad = (n) => String(n).padStart(2, "0");
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Overlap (in minutes) between [a1,a2) and [b1,b2)
const overlapMins = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

// Nicely format a duration in h m
const fmtDuration = (mins) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

// ---------- Theme Context ----------
const ThemeContext = createContext();

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('planner.theme');
      return saved ? JSON.parse(saved) : true; // Default to dark mode
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('planner.theme', JSON.stringify(isDark));
      document.documentElement.classList.toggle('dark', isDark);
    } catch {}
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ---------- Default categories & colors ----------
const CATEGORY_COLORS = {
  Sleep: "#94a3b8", // slate-400
  Work: "#60a5fa", // blue-400
  Gym: "#34d399", // emerald-400
  Study: "#f472b6", // pink-400
  Commute: "#f59e0b", // amber-500
  Leisure: "#22d3ee", // cyan-400
  Meal: "#fb7185", // rose-400
  Other: "#a78bfa", // violet-400
};

const DEFAULTS = [
  { title: "Sleep", category: "Sleep", start: "23:00", duration: 480 }, // 8h
  { title: "Work", category: "Work", start: "09:30", duration: 480 },
  { title: "Gym", category: "Gym", start: "18:00", duration: 60 },
];

// ---------- Main Component ----------
function DayPlannerApp() {
  const [activities, setActivities] = useState(() => {
    try {
      const raw = localStorage.getItem("planner.activities");
      if (raw) return JSON.parse(raw);
    } catch {}
    // seed with defaults + unique ids
    return DEFAULTS.map((a, i) => ({ ...a, id: crypto.randomUUID?.() || `seed-${i}` }));
  });

  const [form, setForm] = useState({
    id: null,
    title: "",
    category: "Work",
    start: "09:00",
    duration: 60,
  });

  const [now, setNow] = useState(() => new Date());
  const nowTick = useRef(null);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem("planner.activities", JSON.stringify(activities));
    } catch {}
  }, [activities]);

  // Realtime clock
  useEffect(() => {
    nowTick.current = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(nowTick.current);
  }, []);

  // Derived values
  const dayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const nowMin = useMemo(() => now.getHours() * 60 + now.getMinutes(), [now]);

  const sorted = useMemo(() =>
    [...activities].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
  [activities]);

  const nextActivity = useMemo(() => {
    return (
      sorted.find((a) => toMinutes(a.start) >= nowMin) || null
    );
  }, [sorted, nowMin]);

  const minsUntilNext = useMemo(() => {
    if (!nextActivity) return null;
    return clamp(toMinutes(nextActivity.start) - nowMin, 0, 24 * 60);
  }, [nextActivity, nowMin]);

  // Free/active time until next Sleep
  const nextSleep = useMemo(() => sorted.find((a) => a.category === "Sleep" && toMinutes(a.start) >= nowMin) || null, [sorted, nowMin]);

  const freeUntilSleep = useMemo(() => {
    if (!nextSleep) return null;
    const sleepStart = toMinutes(nextSleep.start);
    const horizonA = nowMin;
    const horizonB = sleepStart;
    // Sum busy minutes from activities overlapping [now, sleep)
    let busy = 0;
    for (const a of sorted) {
      const aStart = toMinutes(a.start);
      const aEnd = aStart + a.duration;
      busy += overlapMins(horizonA, horizonB, aStart, aEnd);
    }
    const span = Math.max(0, horizonB - horizonA);
    const free = clamp(span - busy, 0, span);
    return free;
  }, [sorted, nowMin, nextSleep]);

  // Calendar dimensions
  const DAY_MINUTES = 24 * 60;
  const CAL_HEIGHT_PX = 24 * 40; // 40px per hour

  // ---------- Handlers ----------
  const resetForm = () => setForm({ id: null, title: "", category: "Work", start: "09:00", duration: 60 });

  const onSubmit = (e) => {
    e.preventDefault();
    const errors = validate(form, activities);
    if (errors.length) {
      alert("Please fix the following:\n\n" + errors.join("\n"));
      return;
    }
    if (form.id) {
      setActivities((prev) => prev.map((a) => (a.id === form.id ? { ...form, duration: Number(form.duration) } : a)));
    } else {
      setActivities((prev) => [
        ...prev,
        { ...form, id: crypto.randomUUID?.() || String(Date.now()), duration: Number(form.duration) },
      ]);
    }
    resetForm();
  };

  const onEdit = (a) => setForm({ ...a });
  const onDelete = (id) => setActivities((prev) => prev.filter((a) => a.id !== id));

  // ---------- Rendering helpers ----------
  const colorFor = (category) => CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;

  const hourMarks = Array.from({ length: 25 }, (_, i) => i * 60);

  const nowPos = (nowMin / DAY_MINUTES) * CAL_HEIGHT_PX;

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-5">
        {/* Left: Controls & Stats */}
        <section className="lg:col-span-2 space-y-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Daily Activity Planner</h1>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                onClick={() => {
                  if (confirm("Clear all activities?")) setActivities([]);
                }}
                className="text-sm px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200"
              >
                Clear All
              </button>
            </div>
          </header>

          {/* Countdown Cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Card>
              <div className="text-sm text-slate-500 dark:text-slate-400">Time now</div>
              <div className="text-2xl font-semibold">
                {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{now.toLocaleDateString()}</div>
            </Card>

            <Card>
              <div className="text-sm text-slate-500 dark:text-slate-400">Next activity</div>
              {nextActivity ? (
                <div>
                  <div className="font-medium">{nextActivity.title || nextActivity.category} @ {nextActivity.start}</div>
                  <div className="text-2xl font-semibold mt-1">
                    {fmtDuration(minsUntilNext)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">until {nextActivity.category.toLowerCase()}</div>
                </div>
              ) : (
                <div className="text-slate-500 dark:text-slate-400">None left today</div>
              )}
            </Card>

            <Card className="sm:col-span-2">
              <div className="text-sm text-slate-500 dark:text-slate-400">Active (free) time before next Sleep</div>
              {nextSleep ? (
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="text-2xl font-semibold">{fmtDuration(freeUntilSleep)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    until sleep at <span className="font-medium">{nextSleep.start}</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 dark:text-slate-400">No upcoming Sleep scheduled today</div>
              )}
            </Card>
          </div>

          {/* Add/Edit Form */}
          <Form
            form={form}
            setForm={setForm}
            onSubmit={onSubmit}
            onCancel={resetForm}
          />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3">
            {Object.entries(CATEGORY_COLORS).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded" style={{ background: v }} /> {k}
              </span>
            ))}
          </div>

          {/* List for quick edits on mobile */}
          <div className="lg:hidden">
            <h2 className="font-semibold mb-2">Today's Activities</h2>
            <ul className="space-y-2">
              {sorted.map((a) => (
                <li key={a.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-8 rounded" style={{ background: colorFor(a.category) }} />
                    <div>
                      <div className="font-medium">{a.title || a.category}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{a.start} • {fmtDuration(a.duration)} • {a.category}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <IconButton label="Edit" onClick={() => onEdit(a)}>
                      ✏️
                    </IconButton>
                    <IconButton label="Delete" onClick={() => onDelete(a.id)}>
                      🗑️
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Right: Calendar */}
        <section className="lg:col-span-3">
          <h2 className="font-semibold mb-2">Daily Calendar</h2>
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4">
            {/* Timeline */}
            <div className="relative" style={{ height: CAL_HEIGHT_PX }}>
              {/* Hour grid */}
              {hourMarks.map((m, idx) => (
                <div key={idx} className="absolute left-0 right-0 border-t border-slate-100 dark:border-slate-700 flex items-start" style={{ top: (m / DAY_MINUTES) * CAL_HEIGHT_PX }}>
                  <div className="-mt-3 text-[10px] text-slate-400 dark:text-slate-500 select-none w-12">{pad(Math.floor(m/60))}:00</div>
                </div>
              ))}

              {/* Now indicator */}
              <div
                className="absolute left-0 right-0 h-0.5 bg-emerald-500/80"
                style={{ top: nowPos }}
              />
              <div className="absolute -top-2 text-[10px] text-emerald-700 dark:text-emerald-400" style={{ top: nowPos - 10 }}>now</div>

              {/* Activity blocks */}
              {sorted.map((a) => {
                const startM = toMinutes(a.start);
                const endM = startM + a.duration;
                const top = (startM / DAY_MINUTES) * CAL_HEIGHT_PX;
                const height = Math.max(18, (a.duration / DAY_MINUTES) * CAL_HEIGHT_PX);
                return (
                  <button
                    key={a.id}
                    onClick={() => onEdit(a)}
                    className="absolute left-14 right-3 text-left rounded-xl shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                    style={{ top, height, background: colorFor(a.category) }}
                    title={`${a.title || a.category} • ${a.start}–${toHHMM(endM)} • ${fmtDuration(a.duration)}`}
                  >
                    <div className="px-3 py-2 text-white/95 text-sm">
                      <div className="font-semibold truncate">{a.title || a.category}</div>
                      <div className="text-xs opacity-80">{a.start}–{toHHMM(endM)} • {a.category}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <footer className="max-w-6xl mx-auto mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
        Tip: click a block in the calendar (or an item in the list) to edit it. Data is saved locally in your browser.
      </footer>
    </div>
  );
}

// ---------- Form Component ----------
function Form({ form, setForm, onSubmit, onCancel }) {
  const categories = Object.keys(CATEGORY_COLORS);

  return (
    <form onSubmit={onSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{form.id ? "Edit Activity" : "Add Activity"}</h2>
        {form.id && (
          <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200">Cancel</button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-slate-600 dark:text-slate-300">Title</label>
          <input
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            placeholder="e.g., Deep Work"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-600 dark:text-slate-300">Category</label>
          <select
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 bg-white"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-600 dark:text-slate-300">Start Time</label>
          <input
            type="time"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2"
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-600 dark:text-slate-300">Duration (minutes)</label>
          <input
            type="number"
            min={5}
            step={5}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2"
            value={form.duration}
            onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600">
          {form.id ? "Update" : "Add"}
        </button>
        <span className="text-xs text-slate-400 dark:text-slate-500">Click an activity block to edit</span>
      </div>
    </form>
  );
}

// ---------- Card & Buttons ----------
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 ${className}`}>
      {children}
    </div>
  );
}

function IconButton({ children, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
    >
      <span className="text-base leading-none">{children}</span>
    </button>
  );
}

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  
  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

// ---------- Validation ----------
function validate(form, all) {
  const errs = [];
  if (!form.start || !/^\d{2}:\d{2}$/.test(form.start)) errs.push("Start time is required (HH:MM)");
  if (!form.duration || form.duration <= 0) errs.push("Duration must be a positive number");

  // Optional: warn for crossing midnight
  const end = toMinutes(form.start) + Number(form.duration);
  if (end > 24 * 60) errs.push("Activity ends after midnight (not supported in this simple day view)");

  // Optional: overlap notice (soft warning)
  const overlaps = all.filter((a) => {
    if (form.id && a.id === form.id) return false;
    const a1 = toMinutes(a.start);
    const a2 = a1 + a.duration;
    const b1 = toMinutes(form.start);
    const b2 = b1 + Number(form.duration);
    return overlapMins(a1, a2, b1, b2) > 0;
  });
  if (overlaps.length) errs.push(`Warning: overlaps with ${overlaps.length} existing activit${overlaps.length === 1 ? "y" : "ies"}`);

  return errs;
}

// ---------- App with Theme Provider ----------
export default function App() {
  return (
    <ThemeProvider>
      <DayPlannerApp />
    </ThemeProvider>
  );
}
