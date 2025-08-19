import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// Daily Activity Planner — first part: utilities, context, and main component
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

  // Timer state
  const [timerState, setTimerState] = useState(() => {
    try {
      const saved = localStorage.getItem('planner.timerState');
      const parsed = saved ? JSON.parse(saved) : null;
      
      // If we have saved state but no baseElapsedTime, add it for compatibility
      if (parsed && typeof parsed.baseElapsedTime === 'undefined') {
        parsed.baseElapsedTime = parsed.elapsedTime || 0;
      }
      
      return parsed || {
        isRunning: false,
        isPaused: false,
        elapsedTime: 0, // seconds elapsed (total)
        baseElapsedTime: 0, // seconds elapsed before current session
        startTime: null, // timestamp when timer started/resumed
        activityId: null, // which activity is being timed
        targetDuration: 0 // target duration in seconds
      };
    } catch {
      return {
        isRunning: false,
        isPaused: false,
        elapsedTime: 0,
        baseElapsedTime: 0,
        startTime: null,
        activityId: null,
        targetDuration: 0
      };
    }
  });

  // Focus mode state
  const [focusMode, setFocusMode] = useState(() => {
    try {
      const saved = localStorage.getItem('planner.focusMode');
      return saved ? JSON.parse(saved) : {
        isEnabled: false,
        focusedActivityId: null
      };
    } catch {
      return {
        isEnabled: false,
        focusedActivityId: null
      };
    }
  });

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

  // Persist timer state
  useEffect(() => {
    try {
      localStorage.setItem("planner.timerState", JSON.stringify(timerState));
    } catch {}
  }, [timerState]);

  // Persist focus mode
  useEffect(() => {
    try {
      localStorage.setItem("planner.focusMode", JSON.stringify(focusMode));
    } catch {}
  }, [focusMode]);

  // Realtime clock
  useEffect(() => {
    nowTick.current = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(nowTick.current);
  }, []);

  // Timer update effect - recalculates elapsed time when running
  useEffect(() => {
    if (timerState.isRunning && !timerState.isPaused && timerState.startTime) {
      // Calculate elapsed time from when timer was started/resumed, plus any previous elapsed time
      const sessionElapsed = Math.floor((Date.now() - timerState.startTime) / 1000);
      const totalElapsed = (timerState.baseElapsedTime || 0) + sessionElapsed;
      
      // Update timer state with current elapsed time only if it changed
      if (totalElapsed !== timerState.elapsedTime) {
        setTimerState(prev => ({
          ...prev,
          elapsedTime: totalElapsed
        }));
      }
      
      // Auto-complete timer if target duration is reached
      if (timerState.targetDuration > 0 && totalElapsed >= timerState.targetDuration) {
        // Timer completed
        setTimerState(prev => ({
          ...prev,
          isRunning: false,
          isPaused: false,
          elapsedTime: prev.targetDuration,
          baseElapsedTime: prev.targetDuration
        }));
        
        // Show completion notification
        if ('Notification' in window && Notification.permission === 'granted') {
          const timedActivity = activities.find(a => a.id === timerState.activityId);
          new Notification('Timer Completed!', {
            body: `Finished: ${timedActivity?.title || 'Activity'}`,
            icon: '/favicon.ico'
          });
        }
      }
    }
  }, [now, timerState.isRunning, timerState.isPaused, timerState.startTime, timerState.targetDuration, timerState.activityId, activities]);

  // Keyboard shortcuts for focus mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && focusMode.isEnabled) {
        toggleFocusMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusMode.isEnabled]);



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

  // Timer handlers
  const startTimer = (activityId = null, customDurationMinutes = null) => {
    const activity = activityId ? activities.find(a => a.id === activityId) : null;
    const targetDurationSeconds = customDurationMinutes ? customDurationMinutes * 60 : (activity?.duration * 60 || 0);
    
    setTimerState(prev => {
      const isNewActivity = prev.activityId !== activityId;
      const baseTime = isNewActivity ? 0 : prev.elapsedTime;
      
      return {
        ...prev,
        isRunning: true,
        isPaused: false,
        startTime: Date.now(),
        activityId: activityId,
        targetDuration: targetDurationSeconds,
        elapsedTime: baseTime,
        baseElapsedTime: baseTime
      };
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const pauseTimer = () => {
    setTimerState(prev => ({
      ...prev,
      isPaused: true,
      isRunning: false,
      baseElapsedTime: prev.elapsedTime // Save current elapsed time as base
    }));
  };

  const resumeTimer = () => {
    setTimerState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      startTime: Date.now(), // Reset start time for new session
      baseElapsedTime: prev.elapsedTime // Keep the current elapsed time as base
    }));
  };

  const stopTimer = () => {
    setTimerState({
      isRunning: false,
      isPaused: false,
      elapsedTime: 0,
      baseElapsedTime: 0,
      startTime: null,
      activityId: null,
      targetDuration: 0
    });
  };

  const toggleFocusMode = (activityId = null) => {
    setFocusMode(prev => ({
      isEnabled: !prev.isEnabled,
      focusedActivityId: prev.isEnabled ? null : activityId
    }));
  };

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

            <Card className="sm:col-span-2">
              <DayProgressBar 
                nowMin={nowMin} 
                sleepConfig={sleepConfig} 
                nextSleep={nextSleep}
                freeUntilSleep={freeUntilSleep}
                sorted={sorted}
              />
            </Card>

            <Card className="sm:col-span-2">
              {nextActivity ? (
                <div className="text-sm flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Next activity in </span>
                    <span className="font-semibold">{fmtDuration(minsUntilNext)}</span>
                  </div>
                  <div className="font-medium">{nextActivity.title || nextActivity.category} @ {to12Hour(nextActivity.start)}</div>
                </div>
              ) : (
                <div className="text-slate-500 dark:text-slate-400 text-sm">None left today</div>
              )}
            </Card>

          </div>

          {/* Timer */}
          <Timer
            timerState={timerState}
            onStart={startTimer}
            onPause={pauseTimer}
            onResume={resumeTimer}
            onStop={stopTimer}
            onToggleFocus={toggleFocusMode}
            currentActivity={timerState.activityId ? activities.find(a => a.id === timerState.activityId) : null}
          />

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
                    <IconButton 
                      label={
                        timerState.activityId === a.id && timerState.isRunning 
                          ? "Pause timer" 
                          : timerState.activityId === a.id && timerState.isPaused
                          ? "Resume timer"
                          : "Start timer"
                      }
                      onClick={() => {
                        if (timerState.activityId === a.id && timerState.isRunning) {
                          pauseTimer();
                        } else if (timerState.activityId === a.id && timerState.isPaused) {
                          resumeTimer();
                        } else {
                          startTimer(a.id);
                        }
                      }}
                    >
                      {timerState.activityId === a.id && timerState.isRunning ? '⏸️' : '▶️'}
                    </IconButton>
                    <IconButton label="Focus Mode" onClick={() => toggleFocusMode(a.id)}>
                      🎯
                    </IconButton>
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
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Timer control button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (timerState.activityId === a.id && timerState.isRunning) {
                            pauseTimer();
                          } else if (timerState.activityId === a.id && timerState.isPaused) {
                            resumeTimer();
                          } else {
                            startTimer(a.id);
                          }
                        }}
                        className={`w-6 h-6 text-white flex items-center justify-center rounded transition-colors ${
                          timerState.activityId === a.id && timerState.isRunning 
                            ? 'bg-yellow-500 hover:bg-yellow-600' 
                            : timerState.activityId === a.id && timerState.isPaused
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'hover:bg-blue-500'
                        }`}
                        aria-label={
                          timerState.activityId === a.id && timerState.isRunning 
                            ? "Pause timer" 
                            : timerState.activityId === a.id && timerState.isPaused
                            ? "Resume timer"
                            : "Start timer"
                        }
                      >
                        {timerState.activityId === a.id && timerState.isRunning ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      
                      {/* Focus mode button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFocusMode(a.id);
                        }}
                        className="w-6 h-6 text-white hover:bg-purple-500 flex items-center justify-center rounded transition-colors"
                        aria-label="Enter focus mode for this activity"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(a.id);
                        }}
                        className="w-6 h-6 text-white hover:text-red-300 flex items-center justify-center"
                        aria-label="Delete activity"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
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

      {/* Focus Mode Overlay */}
      <FocusMode
        focusMode={focusMode}
        timerState={timerState}
        onExitFocus={() => toggleFocusMode()}
        currentActivity={focusMode.focusedActivityId ? activities.find(a => a.id === focusMode.focusedActivityId) : null}
        onStartTimer={startTimer}
        onPauseTimer={pauseTimer}
        onResumeTimer={resumeTimer}
        onStopTimer={stopTimer}
      />
    </div>
  );
}

// ---------- Timer Component ----------
function Timer({ timerState, onStart, onPause, onResume, onStop, currentActivity, onToggleFocus }) {
  // Format seconds into MM:SS or HH:MM:SS
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${minutes}:${pad(secs)}`;
  };

  const progress = timerState.targetDuration > 0 ? (timerState.elapsedTime / timerState.targetDuration) * 100 : 0;
  const remainingTime = Math.max(0, timerState.targetDuration - timerState.elapsedTime);

  return (
    <Card className="border-l-4 border-l-blue-500">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Focus Timer</h3>
          <div className="flex items-center gap-2">
            {currentActivity && (
              <div className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-24">
                {currentActivity.title || currentActivity.category}
              </div>
            )}
            <button
              onClick={() => onToggleFocus(currentActivity?.id)}
              className="p-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
              title="Enter Focus Mode"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Timer display and controls in one row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Animated hourglass */}
            <div className="flex-shrink-0">
              <div 
                className={`w-6 h-6 flex items-center justify-center ${timerState.isRunning ? 'animate-pulse' : ''}`}
              >
                <svg 
                  className={`w-5 h-5 text-blue-500 ${timerState.isRunning ? 'animate-spin' : ''}`} 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                  style={{ 
                    animationDuration: '3s',
                    animationTimingFunction: 'ease-in-out',
                    animationIterationCount: 'infinite'
                  }}
                >
                  {/* Hourglass shape */}
                  <path d="M6,2H18V6.09L14.91,9.18C14.66,9.43 14.66,9.84 14.91,10.09L18,13.18V18H6V13.18L9.09,10.09C9.34,9.84 9.34,9.43 9.09,9.18L6,6.09V2M7.5,3.5V5.59L10.59,8.68C11.37,9.46 11.37,10.72 10.59,11.5L7.5,14.59V16.5H16.5V14.59L13.41,11.5C12.63,10.72 12.63,9.46 13.41,8.68L16.5,5.59V3.5H7.5Z" />
                  
                  {/* Sand animation based on progress */}
                  {timerState.targetDuration > 0 && (
                    <>
                      {/* Top sand (decreasing) */}
                      <path 
                        d="M8,4H16V5L12,8L8,5V4Z" 
                        fill="currentColor" 
                        opacity={0.3 + (1 - progress / 100) * 0.4}
                        className={timerState.isRunning ? 'animate-pulse' : ''}
                      />
                      
                      {/* Bottom sand (increasing) */}
                      <path 
                        d="M8,16H16V17L12,14L8,17V16Z" 
                        fill="currentColor" 
                        opacity={0.3 + (progress / 100) * 0.4}
                        className={timerState.isRunning ? 'animate-pulse' : ''}
                      />
                    </>
                  )}
                </svg>
                
                {/* Falling sand particles animation */}
                {timerState.isRunning && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="w-0.5 h-0.5 bg-blue-400 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 animate-ping" 
                         style={{ animationDelay: '0s', animationDuration: '1s' }} />
                    <div className="w-0.5 h-0.5 bg-blue-300 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 animate-ping" 
                         style={{ animationDelay: '0.3s', animationDuration: '1s' }} />
                    <div className="w-0.5 h-0.5 bg-blue-400 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 animate-ping" 
                         style={{ animationDelay: '0.6s', animationDuration: '1s' }} />
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <div className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-200">
                {formatTime(timerState.elapsedTime)}
              </div>
              {timerState.targetDuration > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatTime(remainingTime)} left
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-1">
            {!timerState.isRunning && !timerState.isPaused && (
              <button
                onClick={() => onStart()}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium flex items-center gap-1 text-sm"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Start
              </button>
            )}
            
            {timerState.isRunning && (
              <button
                onClick={onPause}
                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium flex items-center gap-1 text-sm"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Pause
              </button>
            )}
            
            {timerState.isPaused && (
              <button
                onClick={onResume}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium flex items-center gap-1 text-sm"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Resume
              </button>
            )}
            
            {(timerState.isRunning || timerState.isPaused || timerState.elapsedTime > 0) && (
              <button
                onClick={onStop}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center gap-1 text-sm"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {timerState.targetDuration > 0 && (
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
            <div 
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}

        {/* Quick timer buttons */}
        {!timerState.isRunning && !timerState.isPaused && (
          <div className="flex gap-1 justify-center">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-2 self-center">Quick:</span>
            {[5, 15, 25, 45].map(minutes => (
              <button
                key={minutes}
                onClick={() => onStart(null, minutes)}
                className="px-2 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded"
              >
                {minutes}m
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// Export utilities, context, and components for use in the second part
export {
  pad, toMinutes, toHHMM, clamp, to12Hour, minsTo12Hour, formatCurrentTime, formatHourMarker, 
  overlapMins, fmtDuration, ThemeContext, useTheme, ThemeProvider, CATEGORY_COLORS, DEFAULTS,
  DayPlannerApp, Timer
};