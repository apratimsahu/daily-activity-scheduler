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

// Convert 24h format to 12h format with AM/PM
const to12Hour = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12}:${pad(minutes)} ${period}`;
};

// Convert minutes since midnight to 12h format
const minsTo12Hour = (mins) => {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12}:${pad(minutes)} ${period}`;
};

// Format current time in 12h format with seconds
const formatCurrentTime = (date) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12}:${pad(minutes)}:${pad(seconds)} ${period}`;
};

// Format hour for calendar markers (12h format)
const formatHourMarker = (hour) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}${period}`;
};

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
  { title: "Sleep", category: "Sleep", start: "23:00", duration: 540 }, // 9h (11pm-8am)
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

  // Sleep configuration state
  const [sleepConfig, setSleepConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('planner.sleepConfig');
      return saved ? JSON.parse(saved) : { start: "23:00", duration: 540 }; // Default: 11 PM, 9 hours
    } catch {
      return { start: "23:00", duration: 540 };
    }
  });

  const [now, setNow] = useState(() => new Date());
  const nowTick = useRef(null);

  // Drag and drop state
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedActivity: null,
    dragOffset: { x: 0, y: 0 },
    startY: 0,
    shadowPosition: null, // { top: number, startTime: string }
    currentMouseY: 0,
    justFinishedDrag: false, // Prevent click after drag
    hasMoved: false // Track if we've moved enough to consider it a drag
  });

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem("planner.activities", JSON.stringify(activities));
    } catch {}
  }, [activities]);

  // Persist sleep configuration
  useEffect(() => {
    try {
      localStorage.setItem("planner.sleepConfig", JSON.stringify(sleepConfig));
    } catch {}
  }, [sleepConfig]);

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
      sorted.find((a) => a.category !== 'Sleep' && toMinutes(a.start) >= nowMin) || null
    );
  }, [sorted, nowMin]);

  const minsUntilNext = useMemo(() => {
    if (!nextActivity) return null;
    return clamp(toMinutes(nextActivity.start) - nowMin, 0, 24 * 60);
  }, [nextActivity, nowMin]);

  // Free/active time until next Sleep (using sleep configuration)
  const nextSleep = useMemo(() => {
    const sleepStartMinutes = toMinutes(sleepConfig.start);
    
    // Find the next occurrence of sleep time
    let nextSleepTime;
    if (nowMin <= sleepStartMinutes) {
      // Sleep is later today
      nextSleepTime = sleepStartMinutes;
    } else {
      // Sleep is tomorrow (add 24 hours)
      nextSleepTime = sleepStartMinutes + (24 * 60);
    }
    
    return {
      start: sleepConfig.start,
      startMinutes: nextSleepTime,
      duration: sleepConfig.duration
    };
  }, [sleepConfig, nowMin]);

  const freeUntilSleep = useMemo(() => {
    if (!nextSleep) return null;
    const horizonA = nowMin;
    const horizonB = nextSleep.startMinutes;
    
    // Sum busy minutes from activities overlapping [now, sleep)
    let busy = 0;
    for (const a of sorted) {
      const aStart = toMinutes(a.start);
      const aEnd = aStart + a.duration;
      
      // Handle activities that might span across midnight
      let adjustedStart = aStart;
      let adjustedEnd = aEnd;
      
      // If we're looking at tomorrow's sleep, we need to consider today's activities
      if (horizonB > 24 * 60) {
        // For activities that happen "tomorrow" in the context of late-night schedule
        if (aStart < nowMin) {
          adjustedStart = aStart + (24 * 60);
          adjustedEnd = aEnd + (24 * 60);
        }
      }
      
      busy += overlapMins(horizonA, horizonB, adjustedStart, adjustedEnd);
    }
    
    const span = Math.max(0, horizonB - horizonA);
    const free = clamp(span - busy, 0, span);
    return free;
  }, [sorted, nowMin, nextSleep]);

  const timeUntilSleep = useMemo(() => {
    if (!nextSleep) return null;
    return clamp(nextSleep.startMinutes - nowMin, 0, 24 * 60);
  }, [nextSleep, nowMin]);

  // Calendar dimensions
  const DAY_MINUTES = 24 * 60;
  const AWAKE_MINUTES = DAY_MINUTES - sleepConfig.duration;
  const CAL_HEIGHT_PX = AWAKE_MINUTES * (40 / 60); // Scale to awake time only

  // Utility functions for sleep-aware positioning
  const sleepStart = toMinutes(sleepConfig.start);
  const sleepEnd = (sleepStart + sleepConfig.duration) % DAY_MINUTES;

  // Convert absolute time to display position (calendar starts from sleep end time)
  const timeToDisplayPosition = (timeMinutes) => {
    // Normalize time to 0-1439 range
    const normalizedTime = ((timeMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    
    // Calculate minutes from sleep end (start of awake period)
    let minutesFromWakeUp = 0;
    
    if (sleepStart < sleepEnd) {
      // Sleep doesn't cross midnight (e.g., 02:00 to 08:00)
      if (normalizedTime >= sleepStart && normalizedTime < sleepEnd) {
        // Time is during sleep - not shown on calendar
        return -1; // Indicate this time shouldn't be displayed
      } else if (normalizedTime >= sleepEnd) {
        // Time is after sleep (same day)
        minutesFromWakeUp = normalizedTime - sleepEnd;
      } else {
        // Time is before sleep (next day's schedule)
        minutesFromWakeUp = (normalizedTime + (24 * 60) - sleepEnd);
      }
    } else {
      // Sleep crosses midnight (e.g., 23:00 to 08:00)
      if (normalizedTime >= sleepStart || normalizedTime < sleepEnd) {
        // Time is during sleep - not shown on calendar
        return -1; // Indicate this time shouldn't be displayed
      } else {
        // Time is in awake period (between sleepEnd and sleepStart)
        minutesFromWakeUp = normalizedTime - sleepEnd;
      }
    }
    
    // Clamp to awake period
    minutesFromWakeUp = Math.max(0, Math.min(AWAKE_MINUTES, minutesFromWakeUp));
    
    return (minutesFromWakeUp / AWAKE_MINUTES) * CAL_HEIGHT_PX;
  };

  // Convert display position back to absolute time (from sleep end time)
  const displayPositionToTime = (position) => {
    const awakeRatio = Math.max(0, Math.min(1, position / CAL_HEIGHT_PX));
    const minutesFromWakeUp = awakeRatio * AWAKE_MINUTES;
    
    // Calculate actual time by adding minutes from wake up to sleep end time
    const actualTime = (sleepEnd + minutesFromWakeUp) % (24 * 60);
    
    return actualTime;
  };

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

  // Handle calendar click to add quick activity
  const onCalendarClick = (e) => {
    // Don't create activity if we just finished dragging or clicked on an existing activity
    if (dragState.justFinishedDrag || e.target.closest('button')) return;
    
    const calendarRect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - calendarRect.top;
    const clickTimeMinutes = displayPositionToTime(clickY);
    
    // Snap to 15-minute intervals
    const snappedMinutes = Math.round(clickTimeMinutes / 15) * 15;
    const clampedMinutes = Math.max(0, Math.min(23 * 60 + 45, snappedMinutes)); // Max 11:45 PM to allow 15 min activity
    
    const clickTime = toHHMM(clampedMinutes);
    
    // Create new 15-minute activity
    const newActivity = {
      id: crypto.randomUUID?.() || String(Date.now()),
      title: "Quick Task",
      category: "Other",
      start: clickTime,
      duration: 15 // 15 minutes
    };
    
    setActivities(prev => [...prev, newActivity]);
  };

  // Drag and drop handlers
  const onDragStart = (e, activity) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    
    // Initialize shadow position to the original activity position
    const originalStartTime = activity.start;
    const originalStartMinutes = toMinutes(originalStartTime);
    const originalTop = timeToDisplayPosition(originalStartMinutes);
    
    setDragState({
      isDragging: true,
      draggedActivity: activity,
      dragOffset: { x: e.clientX - rect.left, y: startY },
      startY: e.clientY,
      shadowPosition: {
        top: originalTop,
        startTime: originalStartTime
      },
      currentMouseY: e.clientY
    });
  };

  const onDragMove = (e) => {
    if (!dragState.isDragging) return;
    
    // Check if we've moved enough to consider it a drag (3px threshold)
    const moveDistance = Math.abs(e.clientY - dragState.startY);
    if (moveDistance > 3) {
      setDragState(prev => ({ ...prev, hasMoved: true }));
    }
    
    // Only show shadow and allow repositioning if we've moved enough
    if (moveDistance > 3) {
      // Calculate shadow position accounting for where user clicked within the activity
      const calendarRect = e.currentTarget.getBoundingClientRect();
      const mouseRelativeToCalendar = e.clientY - calendarRect.top;
      
      // Subtract the drag offset to get the activity's top position
      const activityTopRelativeToCalendar = mouseRelativeToCalendar - dragState.dragOffset.y;
      
      const newTimeMinutes = displayPositionToTime(activityTopRelativeToCalendar);
      
      // Snap to 15-minute intervals
      const snappedMinutes = Math.round(newTimeMinutes / 15) * 15;
      const clampedMinutes = Math.max(0, Math.min(23 * 60 + 45, snappedMinutes));
      
      const shadowTop = timeToDisplayPosition(clampedMinutes);
      const shadowStartTime = toHHMM(clampedMinutes);
      
      // Update drag position and shadow
      setDragState(prev => ({
        ...prev,
        currentMouseY: e.clientY,
        shadowPosition: {
          top: shadowTop,
          startTime: shadowStartTime
        }
      }));
    }
  };

  const onDragEnd = (e) => {
    if (!dragState.isDragging) return;
    
    // Check if we moved enough to consider it a drag
    if (dragState.hasMoved && dragState.shadowPosition) {
      // Use the shadow position for the final placement
      const newStartTime = dragState.shadowPosition.startTime;
      
      // Update the activity
      setActivities(prev => prev.map(a => 
        a.id === dragState.draggedActivity.id 
          ? { ...a, start: newStartTime }
          : a
      ));
    } else {
      // If we didn't move enough, treat it as a click to edit
      onEdit(dragState.draggedActivity);
    }
    
    // Reset drag state and set flag to prevent immediate click
    setDragState({
      isDragging: false,
      draggedActivity: null,
      dragOffset: { x: 0, y: 0 },
      startY: 0,
      shadowPosition: null,
      currentMouseY: 0,
      justFinishedDrag: true,
      hasMoved: false
    });

    // Clear the flag after a short delay
    setTimeout(() => {
      setDragState(prev => ({ ...prev, justFinishedDrag: false }));
    }, 50);
  };

  // ---------- Rendering helpers ----------
  const colorFor = (category) => CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;

  // Generate hour marks starting from sleep end time
  const hourMarks = useMemo(() => {
    const marks = [];
    
    // Calculate how many full hours we have in the awake period
    const awakeHours = Math.floor(AWAKE_MINUTES / 60);
    
    // Add hour marks for each full hour from wake up
    for (let i = 0; i <= awakeHours; i++) {
      const minutesFromWakeUp = i * 60;
      const actualTimeMinutes = (sleepEnd + minutesFromWakeUp) % (24 * 60);
      const hour = Math.floor(actualTimeMinutes / 60);
      const displayPosition = (minutesFromWakeUp / AWAKE_MINUTES) * CAL_HEIGHT_PX;
      
      marks.push({
        minutes: actualTimeMinutes,
        displayPosition: displayPosition,
        hour: hour
      });
    }
    
    // Always add the sleep start time as the final mark at the bottom
    // This ensures we show the exact moment when sleep begins
    const sleepStartHour = Math.floor(sleepStart / 60);
    const lastMark = marks[marks.length - 1];
    
    // Only add if it's different from the last hour mark
    if (!lastMark || lastMark.hour !== sleepStartHour) {
      marks.push({
        minutes: sleepStart,
        displayPosition: CAL_HEIGHT_PX - 1, // Position just before the very bottom to ensure visibility
        hour: sleepStartHour
      });
    }
    
    return marks;
  }, [sleepStart, sleepEnd, sleepConfig.duration, AWAKE_MINUTES, CAL_HEIGHT_PX]);


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
            <Card className="sm:col-span-2">
              <AnalogClock now={now} />
            </Card>

            <Card>
              <div className="text-sm text-slate-500 dark:text-slate-400">Next activity</div>
              {nextActivity ? (
                <div>
                  <div className="font-medium">{nextActivity.title || nextActivity.category} @ {to12Hour(nextActivity.start)}</div>
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
                <div className="space-y-2">
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="text-2xl font-semibold">{fmtDuration(freeUntilSleep)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      free time until sleep at <span className="font-medium">{to12Hour(nextSleep.start)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Time until sleep:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtDuration(timeUntilSleep)}</span>
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

          {/* Sleep Configuration */}
          <SleepConfig
            sleepConfig={sleepConfig}
            setSleepConfig={setSleepConfig}
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
                      <div className="text-xs text-slate-500 dark:text-slate-400">{to12Hour(a.start)} • {fmtDuration(a.duration)} • {a.category}</div>
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
            <div 
              className="relative calendar-timeline cursor-pointer" 
              style={{ height: CAL_HEIGHT_PX }}
              onMouseMove={onDragMove}
              onMouseUp={onDragEnd}
              onMouseLeave={onDragEnd}
              onClick={onCalendarClick}
            >
              {/* Hour grid */}
              {hourMarks.map((mark, idx) => (
                <div key={idx} className="absolute left-0 right-0 border-t border-slate-100 dark:border-slate-700 flex items-start" style={{ top: mark.displayPosition }}>
                  <div className="-mt-3 text-[10px] text-slate-400 dark:text-slate-500 select-none w-12">{formatHourMarker(mark.hour)}</div>
                </div>
              ))}

              {/* Now indicator - only show if not during sleep */}
              {(() => {
                const nowPosition = timeToDisplayPosition(nowMin);
                if (nowPosition >= 0) {
                  return (
                    <>
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-emerald-500/80"
                        style={{ top: nowPosition }}
                      />
                      <div className="absolute -top-2 text-[10px] text-emerald-700 dark:text-emerald-400" style={{ top: nowPosition - 10 }}>now</div>
                    </>
                  );
                }
                return null;
              })()}

              {/* Activity blocks */}
              {sorted
                .filter(a => a.category !== 'Sleep') // Don't show sleep activities in calendar
                .filter(a => timeToDisplayPosition(toMinutes(a.start)) >= 0) // Only show activities during awake time
                .map((a) => {
                  const startM = toMinutes(a.start);
                  const endM = startM + a.duration;
                  const top = timeToDisplayPosition(startM);
                  const height = Math.max(18, (a.duration / AWAKE_MINUTES) * CAL_HEIGHT_PX);
                  const isDragging = dragState.isDragging && dragState.draggedActivity?.id === a.id;
                
                return (
                  <div
                    key={a.id}
                    className={`absolute left-14 right-3 rounded-xl shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow group ${
                      isDragging ? 'opacity-50 z-50' : ''
                    }`}
                    style={{ 
                      top, 
                      height, 
                      background: colorFor(a.category),
                      userSelect: 'none'
                    }}
                    title={`${a.title || a.category} • ${to12Hour(a.start)}–${minsTo12Hour(endM)} • ${fmtDuration(a.duration)}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent calendar click
                      }}
                      onMouseDown={(e) => onDragStart(e, a)}
                      className="w-full h-full text-left cursor-move"
                    >
                      <div className="px-3 py-2 text-white/95 text-sm pointer-events-none">
                        <div className="font-semibold truncate">{a.title || a.category}</div>
                        <div className="text-xs opacity-80">{to12Hour(a.start)}–{minsTo12Hour(endM)} • {a.category}</div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(a.id);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 text-white hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      aria-label="Delete activity"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                );
              })}

              {/* Shadow preview during drag */}
              {dragState.isDragging && dragState.shadowPosition && dragState.draggedActivity && (
                <div
                  className="absolute left-14 right-3 rounded-xl border-2 border-dashed border-slate-400 bg-slate-200/50 dark:bg-slate-600/50 z-40"
                  style={{
                    top: dragState.shadowPosition.top,
                    height: Math.max(18, (dragState.draggedActivity.duration / AWAKE_MINUTES) * CAL_HEIGHT_PX),
                    pointerEvents: 'none'
                  }}
                >
                  <div className="px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">
                    <div className="font-semibold truncate opacity-75">{dragState.draggedActivity.title || dragState.draggedActivity.category}</div>
                    <div className="text-xs opacity-60">
                      {to12Hour(dragState.shadowPosition.startTime)}–{minsTo12Hour((toMinutes(dragState.shadowPosition.startTime) + dragState.draggedActivity.duration) % (24 * 60))} • {dragState.draggedActivity.category}
                    </div>
                  </div>
                </div>
              )}
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

// ---------- TimeSelector Component ----------
function TimeSelector({ value, onChange }) {
  // Convert 24h format to 12h components
  const [hours24, minutes] = value.split(':').map(Number);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  
  // Generate options
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10, ..., 55
  const periodOptions = ['AM', 'PM'];
  
  const handleChange = (newHours12, newMinutes, newPeriod) => {
    // Convert back to 24h format
    let hours24 = newHours12;
    if (newPeriod === 'AM' && newHours12 === 12) hours24 = 0;
    else if (newPeriod === 'PM' && newHours12 !== 12) hours24 = newHours12 + 12;
    
    const timeStr = `${pad(hours24)}:${pad(newMinutes)}`;
    onChange(timeStr);
  };
  
  return (
    <div className="flex gap-2">
      {/* Hours */}
      <select
        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 bg-white"
        value={hours12}
        onChange={(e) => handleChange(Number(e.target.value), minutes, period)}
      >
        {hourOptions.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      
      {/* Minutes */}
      <select
        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 bg-white"
        value={minutes}
        onChange={(e) => handleChange(hours12, Number(e.target.value), period)}
      >
        {minuteOptions.map(m => (
          <option key={m} value={m}>{pad(m)}</option>
        ))}
      </select>
      
      {/* AM/PM */}
      <select
        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 bg-white"
        value={period}
        onChange={(e) => handleChange(hours12, minutes, e.target.value)}
      >
        {periodOptions.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}

// ---------- Sleep Configuration Component ----------
function SleepConfig({ sleepConfig, setSleepConfig }) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Sleep Configuration</h2>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label={isCollapsed ? "Expand sleep configuration" : "Collapse sleep configuration"}
        >
          <svg 
            className={`w-5 h-5 text-slate-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      {!isCollapsed && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-600 dark:text-slate-300">Sleep Start Time</label>
              <TimeSelector
                value={sleepConfig.start}
                onChange={(time) => setSleepConfig(prev => ({ ...prev, start: time }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-slate-600 dark:text-slate-300">Sleep Duration (hours)</label>
              <select
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 p-2 bg-white"
                value={sleepConfig.duration / 60}
                onChange={(e) => setSleepConfig(prev => ({ ...prev, duration: Number(e.target.value) * 60 }))}
              >
                {Array.from({ length: 9 }, (_, i) => i + 4).map(hours => (
                  <option key={hours} value={hours}>{hours} hours</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Sleep period: {to12Hour(sleepConfig.start)} - {minsTo12Hour((toMinutes(sleepConfig.start) + sleepConfig.duration) % (24 * 60))} 
            ({fmtDuration(sleepConfig.duration)})
          </div>
        </>
      )}
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
          <TimeSelector
            value={form.start}
            onChange={(time) => setForm((f) => ({ ...f, start: time }))}
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

// ---------- Analog Clock Component ----------
function AnalogClock({ now }) {
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();

  // Calculate angles (12 o'clock = 0°)
  const hourAngle = (hours * 30) + (minutes * 0.5) + (seconds * 0.00833); // Include seconds for smoother hour hand
  const minuteAngle = (minutes * 6) + (seconds * 0.1); // Include seconds for smoother minute hand
  const secondAngle = (seconds * 6) + (milliseconds * 0.006); // Include milliseconds for smoother second hand

  // Hour markers (12 positions)
  const hourMarkers = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30; // 30° apart
    const isMainHour = i % 3 === 0; // 12, 3, 6, 9 are main hours
    return { angle, isMainHour, number: i === 0 ? 12 : i };
  });

  // Minute markers (60 positions, but only show some)
  const minuteMarkers = Array.from({ length: 60 }, (_, i) => {
    const angle = i * 6; // 6° apart
    const isVisible = i % 5 !== 0; // Don't show where hour markers are
    return { angle, isVisible };
  });

  return (
    <div className="relative w-48 h-48 mx-auto">
      {/* Clock face */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white to-slate-50 dark:from-slate-700 dark:to-slate-800 shadow-lg border-4 border-slate-200 dark:border-slate-600">
        {/* Minute markers */}
        {minuteMarkers.map((marker, i) => marker.isVisible && (
          <div
            key={`minute-${i}`}
            className="absolute w-0.5 h-3 bg-slate-300 dark:bg-slate-500"
            style={{
              top: '6px',
              left: '50%',
              transformOrigin: '50% 90px',
              transform: `translateX(-50%) rotate(${marker.angle}deg)`
            }}
          />
        ))}

        {/* Hour markers */}
        {hourMarkers.map((marker, i) => (
          <div key={`hour-${i}`}>
            {/* Hour tick */}
            <div
              className={`absolute ${marker.isMainHour ? 'w-1 h-6 bg-slate-600 dark:bg-slate-200' : 'w-0.5 h-4 bg-slate-400 dark:bg-slate-400'}`}
              style={{
                top: marker.isMainHour ? '6px' : '8px',
                left: '50%',
                transformOrigin: '50% 90px',
                transform: `translateX(-50%) rotate(${marker.angle}deg)`
              }}
            />
          </div>
        ))}

        {/* Hour hand */}
        <div
          className="absolute w-1 h-12 bg-slate-700 dark:bg-slate-200 rounded-full shadow-sm z-20 transition-transform duration-1000 ease-out"
          style={{
            top: '50%',
            left: '50%',
            transformOrigin: '50% 100%',
            transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`
          }}
        />

        {/* Minute hand */}
        <div
          className="absolute w-0.5 h-16 bg-slate-800 dark:bg-slate-100 rounded-full shadow-sm z-30 transition-transform duration-1000 ease-out"
          style={{
            top: '50%',
            left: '50%',
            transformOrigin: '50% 100%',
            transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`
          }}
        />

        {/* Second hand */}
        <div
          className="absolute w-px h-20 z-40"
          style={{
            top: '50%',
            left: '50%',
            transformOrigin: '50% 100%',
            transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`
          }}
        >
          {/* Second hand with different colored sections */}
          <div className="h-4 bg-transparent" />
          <div className="h-14 bg-red-500 w-full" />
          <div className="h-2 bg-red-500 w-full" />
        </div>

        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-slate-800 dark:bg-slate-100 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-50 shadow-sm" />
        
        {/* Center highlight */}
        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white dark:bg-slate-600 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-50" />

        {/* Outer rim highlight */}
        <div className="absolute inset-1 rounded-full border border-slate-100 dark:border-slate-600 opacity-50" />
        
        {/* Inner shadow */}
        <div className="absolute inset-2 rounded-full shadow-inner opacity-20" />
      </div>

      {/* Date text */}
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {now.getDate()}{now.getDate() === 1 || now.getDate() === 21 || now.getDate() === 31 ? 'st' : 
         now.getDate() === 2 || now.getDate() === 22 ? 'nd' : 
         now.getDate() === 3 || now.getDate() === 23 ? 'rd' : 'th'} {now.toLocaleDateString('en-US', { month: 'short' })}
      </div>
      
      {/* Digital time display */}
      <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 bg-slate-100 dark:bg-slate-600 rounded-lg px-2 py-1 text-xs font-mono text-slate-700 dark:text-slate-200 shadow-sm">
        {formatCurrentTime(now)}
      </div>

      {/* Outer glow effect */}
      <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-emerald-200/20 to-blue-200/20 dark:from-emerald-400/10 dark:to-blue-400/10 blur-xl opacity-30" />
    </div>
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
