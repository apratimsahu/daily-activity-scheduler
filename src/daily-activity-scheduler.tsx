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

  // Timer state
  const [timerState, setTimerState] = useState(() => {
    try {
      const saved = localStorage.getItem('planner.timerState');
      const parsed = saved ? JSON.parse(saved) : null;
      
      // If we have saved state but no baseElapsedTime, add it for compatibility
      if (parsed && typeof parsed.baseElapsedTime === 'undefined') {
        parsed.baseElapsedTime = parsed.elapsedTime || 0;
      }
      
      // If we have saved state but no focusSessions, add it for compatibility
      if (parsed && !Array.isArray(parsed.focusSessions)) {
        parsed.focusSessions = [];
      }
      
      return parsed || {
        isRunning: false,
        isPaused: false,
        elapsedTime: 0, // seconds elapsed (total)
        baseElapsedTime: 0, // seconds elapsed before current session
        startTime: null, // timestamp when timer started/resumed
        activityId: null, // which activity is being timed
        targetDuration: 0, // target duration in seconds
        focusSessions: [] // array of {startTime, endTime, activityId} for calendar visualization
      };
    } catch {
      return {
        isRunning: false,
        isPaused: false,
        elapsedTime: 0,
        baseElapsedTime: 0,
        startTime: null,
        activityId: null,
        targetDuration: 0,
        focusSessions: []
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
    setTimerState(prev => {
      const now = Date.now();
      const updatedSessions = [...prev.focusSessions];
      
      // If we're in focus mode and there was a start time, record this focus session
      if (focusMode.isEnabled && prev.startTime) {
        updatedSessions.push({
          startTime: prev.startTime,
          endTime: now,
          activityId: prev.activityId
        });
      }
      
      return {
        ...prev,
        isPaused: true,
        isRunning: false,
        baseElapsedTime: prev.elapsedTime, // Save current elapsed time as base
        focusSessions: updatedSessions
      };
    });
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
    setTimerState(prev => {
      const now = Date.now();
      const updatedSessions = [...prev.focusSessions];
      
      // If we're in focus mode and there was a start time, record this focus session
      if (focusMode.isEnabled && prev.startTime) {
        updatedSessions.push({
          startTime: prev.startTime,
          endTime: now,
          activityId: prev.activityId
        });
      }
      
      return {
        isRunning: false,
        isPaused: false,
        elapsedTime: 0,
        baseElapsedTime: 0,
        startTime: null,
        activityId: null,
        targetDuration: 0,
        focusSessions: updatedSessions
      };
    });
  };

  const toggleFocusMode = (activityId = null) => {
    // If exiting focus mode while timer is running, record the session
    if (focusMode.isEnabled && timerState.isRunning && timerState.startTime) {
      setTimerState(prevTimer => {
        const now = Date.now();
        const updatedSessions = [...prevTimer.focusSessions];
        
        updatedSessions.push({
          startTime: prevTimer.startTime,
          endTime: now,
          activityId: prevTimer.activityId
        });
        
        return {
          ...prevTimer,
          focusSessions: updatedSessions
        };
      });
    }
    
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
          <Card>
            <h2 className="font-semibold mb-4">Daily Calendar</h2>
            <div className="relative">
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

              {/* Focus session bars */}
              {(() => {
                // Filter today's focus sessions
                const today = new Date();
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                const todayEnd = todayStart + (24 * 60 * 60 * 1000);
                
                const todayFocusSessions = timerState.focusSessions.filter(session => 
                  session.startTime >= todayStart && session.startTime < todayEnd
                );
                
                return todayFocusSessions.map((session, index) => {
                  // Convert timestamps to minutes from midnight
                  const startMinutes = Math.floor((session.startTime % (24 * 60 * 60 * 1000)) / (60 * 1000));
                  const endMinutes = Math.floor((session.endTime % (24 * 60 * 60 * 1000)) / (60 * 1000));
                  
                  // Calculate display position and height
                  const startPos = timeToDisplayPosition(startMinutes);
                  const duration = endMinutes - startMinutes;
                  const height = Math.max(8, (duration / AWAKE_MINUTES) * CAL_HEIGHT_PX);
                  
                  // Only show if within awake time
                  if (startPos < 0) return null;
                  
                  // Find associated activity for context
                  const activity = activities.find(a => a.id === session.activityId);
                  
                  return (
                    <div
                      key={`focus-${index}`}
                      className="absolute right-1 w-2 rounded-sm bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 dark:from-blue-500 dark:via-blue-600 dark:to-blue-700 opacity-80 z-30"
                      style={{
                        top: startPos,
                        height: height
                      }}
                      title={`Focus session: ${activity?.title || activity?.category || 'Unknown'} (${fmtDuration(duration)})`}
                    />
                  );
                });
              })()}

              {/* Current focus session bar (if timer is running in focus mode) */}
              {focusMode.isEnabled && timerState.isRunning && timerState.startTime && (() => {
                const sessionStartMinutes = Math.floor((timerState.startTime % (24 * 60 * 60 * 1000)) / (60 * 1000));
                const startPos = timeToDisplayPosition(sessionStartMinutes);
                const duration = nowMin - sessionStartMinutes;
                const height = Math.max(8, (duration / AWAKE_MINUTES) * CAL_HEIGHT_PX);
                
                if (startPos < 0 || duration <= 0) return null;
                
                const currentActivity = activities.find(a => a.id === timerState.activityId);
                
                return (
                  <div
                    className="absolute right-1 w-2 rounded-sm bg-gradient-to-b from-green-400 via-green-500 to-green-600 dark:from-green-500 dark:via-green-600 dark:to-green-700 opacity-90 z-30 animate-pulse"
                    style={{
                      top: startPos,
                      height: height
                    }}
                    title={`Current focus session: ${currentActivity?.title || currentActivity?.category || 'Active'} (${fmtDuration(duration)})`}
                  />
                );
              })()}

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
          </Card>
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

// ---------- Focus Mode Component ----------
function FocusMode({ focusMode, timerState, onExitFocus, currentActivity, onStartTimer, onPauseTimer, onResumeTimer, onStopTimer }) {
  if (!focusMode.isEnabled) return null;

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
    <div className="fixed inset-0 bg-slate-900 dark:bg-black z-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Exit button */}
        <div className="absolute top-4 right-4">
          <button
            onClick={onExitFocus}
            className="p-3 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
            aria-label="Exit focus mode"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Activity info */}
        {currentActivity && (
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">
              {currentActivity.title || currentActivity.category}
            </h1>
            <div className="text-slate-400 text-lg">
              {currentActivity.category} • {fmtDuration(currentActivity.duration)}
            </div>
          </div>
        )}

        {/* Timer display */}
        <div className="bg-slate-800 rounded-3xl p-12 border border-slate-700">
          <div className="text-8xl font-mono font-bold text-white mb-4">
            {formatTime(timerState.elapsedTime)}
          </div>
          
          {timerState.targetDuration > 0 && (
            <div className="text-slate-400 text-xl mb-6">
              Target: {formatTime(timerState.targetDuration)} | Remaining: {formatTime(remainingTime)}
            </div>
          )}

          {/* Progress bar */}
          {timerState.targetDuration > 0 && (
            <div className="w-full bg-slate-700 rounded-full h-3 mb-8">
              <div 
                className="bg-blue-500 h-3 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          )}

          {/* Timer controls */}
          <div className="flex gap-4 justify-center">
            {!timerState.isRunning && !timerState.isPaused && (
              <button
                onClick={() => onStartTimer(currentActivity?.id)}
                className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-xl flex items-center gap-3"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Start Focus
              </button>
            )}
            
            {timerState.isRunning && (
              <button
                onClick={onPauseTimer}
                className="px-8 py-4 bg-yellow-500 hover:bg-yellow-600 text-white rounded-2xl font-bold text-xl flex items-center gap-3"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Pause
              </button>
            )}
            
            {timerState.isPaused && (
              <button
                onClick={onResumeTimer}
                className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-xl flex items-center gap-3"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Resume
              </button>
            )}
            
            {(timerState.isRunning || timerState.isPaused || timerState.elapsedTime > 0) && (
              <button
                onClick={onStopTimer}
                className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold text-xl flex items-center gap-3"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Focus tips */}
        <div className="text-slate-400 text-sm max-w-md mx-auto">
          <p>Focus mode eliminates distractions. Press Esc to exit or click the ✕ button.</p>
        </div>
      </div>
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
  const [isCollapsed, setIsCollapsed] = useState(() => !form.id); // Collapsed by default unless editing

  // Auto-expand when editing
  useEffect(() => {
    if (form.id) {
      setIsCollapsed(false);
    }
  }, [form.id]);

  return (
    <form onSubmit={onSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{form.id ? "Edit Activity" : "Add Activity"}</h2>
        <div className="flex items-center gap-2">
          {form.id && (
            <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200">Cancel</button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label={isCollapsed ? "Expand add activity form" : "Collapse add activity form"}
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
      </div>
      
      {!isCollapsed && (
        <>
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
        </>
      )}
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
          className="absolute w-1 h-12 bg-slate-700 dark:bg-slate-200 rounded-full shadow-sm z-20"
          style={{
            top: '50%',
            left: '50%',
            transformOrigin: '50% 100%',
            transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`
          }}
        />

        {/* Minute hand */}
        <div
          className="absolute w-0.5 h-16 bg-slate-800 dark:bg-slate-100 rounded-full shadow-sm z-30"
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

// ---------- Day Progress Bar Component ----------
function DayProgressBar({ nowMin, sleepConfig, nextSleep, freeUntilSleep, sorted }) {
  // Calculate awake period boundaries
  const sleepStart = toMinutes(sleepConfig.start);
  const sleepEnd = (sleepStart + sleepConfig.duration) % (24 * 60);
  const awakeMinutes = 24 * 60 - sleepConfig.duration;
  
  // Calculate current position within the awake period
  let currentAwakePosition = 0;
  
  if (sleepStart < sleepEnd) {
    // Sleep doesn't cross midnight (e.g., 02:00 to 08:00)
    if (nowMin >= sleepStart && nowMin < sleepEnd) {
      // Currently sleeping - show as if at start of awake period
      currentAwakePosition = 0;
    } else if (nowMin >= sleepEnd) {
      // After sleep (same day)
      currentAwakePosition = nowMin - sleepEnd;
    } else {
      // Before sleep (next day's schedule)
      currentAwakePosition = (nowMin + (24 * 60) - sleepEnd);
    }
  } else {
    // Sleep crosses midnight (e.g., 23:00 to 08:00)
    if (nowMin >= sleepStart || nowMin < sleepEnd) {
      // Currently sleeping - show as if at start of awake period
      currentAwakePosition = 0;
    } else {
      // In awake period (between sleepEnd and sleepStart)
      currentAwakePosition = nowMin - sleepEnd;
    }
  }
  
  // Clamp to awake period
  currentAwakePosition = Math.max(0, Math.min(awakeMinutes, currentAwakePosition));
  
  // Calculate progress percentage
  const progressPercentage = (currentAwakePosition / awakeMinutes) * 100;
  
  // Calculate remaining time until sleep
  const remainingMinutes = awakeMinutes - currentAwakePosition;
  
  // Calculate total scheduled activities from now until sleep
  let totalScheduledFromNow = 0;
  if (nextSleep) {
    const horizonA = nowMin;
    const horizonB = nextSleep.startMinutes;
    
    for (const a of sorted) {
      const aStart = toMinutes(a.start);
      const aEnd = aStart + a.duration;
      
      // Handle activities that might span across midnight
      let adjustedStart = aStart;
      let adjustedEnd = aEnd;
      
      // If we're looking at tomorrow's sleep, we need to consider today's activities
      if (horizonB > 24 * 60) {
        if (aStart < nowMin) {
          adjustedStart = aStart + (24 * 60);
          adjustedEnd = aEnd + (24 * 60);
        }
      }
      
      totalScheduledFromNow += overlapMins(horizonA, horizonB, adjustedStart, adjustedEnd);
    }
  }
  
  // Create time segments for the entire day visualization (past and future)
  const createTimeSegments = () => {
    if (!nextSleep) return { pastSegments: [], futureSegments: [] };
    
    const currentTime = nowMin;
    const sleepTime = nextSleep.startMinutes;
    
    // Calculate the start of the awake period
    const awakeStartTime = sleepEnd;
    
    // Get all activities during the awake period
    const allActivities = sorted
      .filter(a => a.category !== 'Sleep') // Exclude sleep activities
      .map(a => {
        const aStart = toMinutes(a.start);
        let adjustedStart = aStart;
        let adjustedEnd = aStart + a.duration;
        
        // Handle midnight crossover for activities
        if (sleepTime > 24 * 60 && aStart < awakeStartTime) {
          adjustedStart = aStart + (24 * 60);
          adjustedEnd = adjustedStart + a.duration;
        }
        
        return {
          ...a,
          adjustedStart,
          adjustedEnd
        };
      })
      .filter(a => a.adjustedStart >= awakeStartTime && a.adjustedStart < sleepTime)
      .sort((a, b) => a.adjustedStart - b.adjustedStart);
    
    const pastSegments = [];
    const futureSegments = [];
    
    // Process all activities and split them across past/future based on current time
    let lastTime = awakeStartTime;
    
    for (const activity of allActivities) {
      const activityStart = activity.adjustedStart;
      const activityEnd = Math.min(activity.adjustedEnd, sleepTime);
      
      // Add free time before this activity starts
      if (activityStart > lastTime) {
        const freeEnd = Math.min(activityStart, sleepTime);
        
        if (lastTime < currentTime && freeEnd > lastTime) {
          // Past free time portion
          const pastFreeEnd = Math.min(freeEnd, currentTime);
          if (pastFreeEnd > lastTime) {
            pastSegments.push({
              type: 'past-free',
              start: lastTime,
              end: pastFreeEnd,
              duration: pastFreeEnd - lastTime
            });
          }
          
          // Future free time portion
          if (freeEnd > currentTime && currentTime < freeEnd) {
            futureSegments.push({
              type: 'free',
              start: Math.max(currentTime, lastTime),
              end: freeEnd,
              duration: freeEnd - Math.max(currentTime, lastTime)
            });
          }
        } else if (lastTime >= currentTime) {
          // Entirely in the future
          futureSegments.push({
            type: 'free',
            start: lastTime,
            end: freeEnd,
            duration: freeEnd - lastTime
          });
        }
      }
      
      // Process the activity itself
      if (activityEnd > activityStart) {
        if (activityStart >= currentTime) {
          // Activity is entirely in the future
          futureSegments.push({
            type: 'scheduled',
            start: activityStart,
            end: activityEnd,
            duration: activityEnd - activityStart,
            activity
          });
        } else if (activityEnd <= currentTime) {
          // Activity is entirely in the past
          pastSegments.push({
            type: 'past-scheduled',
            start: activityStart,
            end: activityEnd,
            duration: activityEnd - activityStart,
            activity
          });
        } else {
          // Activity spans current time (ongoing activity)
          // Past portion (completed part)
          pastSegments.push({
            type: 'past-scheduled',
            start: activityStart,
            end: currentTime,
            duration: currentTime - activityStart,
            activity
          });
          
          // Future portion (remaining part)
          futureSegments.push({
            type: 'scheduled',
            start: currentTime,
            end: activityEnd,
            duration: activityEnd - currentTime,
            activity
          });
        }
      }
      
      lastTime = Math.max(lastTime, activityEnd);
    }
    
    // Add final free time segment until sleep (if any)
    if (lastTime < sleepTime) {
      if (lastTime < currentTime) {
        // Past free time portion
        const pastFreeEnd = Math.min(currentTime, sleepTime);
        if (pastFreeEnd > lastTime) {
          pastSegments.push({
            type: 'past-free',
            start: lastTime,
            end: pastFreeEnd,
            duration: pastFreeEnd - lastTime
          });
        }
        
        // Future free time portion
        if (sleepTime > currentTime) {
          futureSegments.push({
            type: 'free',
            start: Math.max(currentTime, lastTime),
            end: sleepTime,
            duration: sleepTime - Math.max(currentTime, lastTime)
          });
        }
      } else {
        // Entirely in the future
        futureSegments.push({
          type: 'free',
          start: lastTime,
          end: sleepTime,
          duration: sleepTime - lastTime
        });
      }
    }
    
    return { pastSegments, futureSegments };
  };
  
  const { pastSegments, futureSegments } = createTimeSegments();
  
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-500 dark:text-slate-400 text-center">
        Day Progress <span className="text-xs">({minsTo12Hour(sleepEnd)} - {minsTo12Hour(sleepStart)})</span>
      </div>
      
      {/* Progress bar with percentage indicator */}
      <div className="flex items-center gap-3">
        {/* Day progress percentage indicator */}
        <div className="flex-shrink-0">
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-600">
            {Math.round(progressPercentage)}%
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="flex-1 relative h-6 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          {/* Past time segments (before current time) */}
          {pastSegments.map((segment, index) => {
            const segmentStartPos = ((segment.start - sleepEnd) / awakeMinutes) * 100;
            const segmentWidth = (segment.duration / awakeMinutes) * 100;
            
            return (
              <div
                key={`past-${index}`}
                className={`absolute top-0 h-full transition-all duration-1000 ease-out ${
                  segment.type === 'past-free' 
                    ? 'bg-slate-300 dark:bg-slate-600' 
                    : 'bg-orange-300/60 dark:bg-orange-400/40'
                }`}
                style={{
                  left: `${Math.max(0, segmentStartPos)}%`,
                  width: `${Math.max(0, segmentWidth)}%`,
                  backgroundImage: `repeating-linear-gradient(
                    45deg,
                    transparent,
                    transparent 2px,
                    rgba(255, 255, 255, 0.15) 2px,
                    rgba(255, 255, 255, 0.15) 4px
                  )`
                }}
                title={segment.type === 'past-scheduled' 
                  ? `Past: ${segment.activity.title || segment.activity.category} (${fmtDuration(segment.duration)})`
                  : `Past free time (${fmtDuration(segment.duration)})`
                }
              />
            );
          })}
          
          {/* Future time segments (after current time) */}
          {futureSegments.map((segment, index) => {
            const segmentStartPos = ((segment.start - sleepEnd) / awakeMinutes) * 100;
            const segmentWidth = (segment.duration / awakeMinutes) * 100;
            
            return (
              <div
                key={`future-${index}`}
                className={`absolute top-0 h-full transition-all duration-1000 ease-out ${
                  segment.type === 'free' 
                    ? 'bg-gradient-to-b from-emerald-300 via-emerald-400 to-emerald-600 dark:from-emerald-400 dark:via-emerald-500 dark:to-emerald-700' 
                    : 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 dark:from-amber-400 dark:via-amber-500 dark:to-amber-700'
                }`}
                style={{
                  left: `${Math.max(0, segmentStartPos)}%`,
                  width: `${Math.max(0, segmentWidth)}%`
                }}
                title={segment.type === 'scheduled' 
                  ? `${segment.activity.title || segment.activity.category} (${fmtDuration(segment.duration)})`
                  : `Free time (${fmtDuration(segment.duration)})`
                }
              />
            );
          })}
          
          {/* Current time indicator */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-slate-800 dark:bg-slate-200 shadow-lg transition-all duration-1000 ease-out z-10"
            style={{ left: `${progressPercentage}%` }}
          />
        </div>
      </div>
      
      {/* Time labels */}
      <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="space-y-1">
          <div>
            Until sleep: <span className="font-semibold text-blue-600 dark:text-blue-400">{fmtDuration(remainingMinutes)}</span>
          </div>
          <div>
            Awake: <span className="font-semibold text-slate-500 dark:text-slate-400">{fmtDuration(currentAwakePosition)} (total {fmtDuration(awakeMinutes)})</span>
          </div>
        </div>
        <div className="space-y-1 text-right">
          <div>
            Free time left: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtDuration(freeUntilSleep || 0)}</span>
          </div>
          <div>
            Scheduled left: <span className="font-semibold text-amber-600 dark:text-amber-400">
              {fmtDuration(totalScheduledFromNow)} ({remainingMinutes > 0 ? Math.round((totalScheduledFromNow / remainingMinutes) * 100) : 0}%)
            </span>
          </div>
        </div>
      </div>
      
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
