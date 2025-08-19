import React, { useState, useEffect } from "react";
import { 
  pad, toMinutes, minsTo12Hour, fmtDuration, overlapMins, to12Hour, formatCurrentTime,
  useTheme, ThemeProvider, DayPlannerApp, CATEGORY_COLORS 
} from "./utils-and-components";

// Daily Activity Planner — second part: additional components and main app
// Contains: FocusMode, TimeSelector, SleepConfig, Form, Card, IconButton, 
// AnalogClock, DayProgressBar, ThemeToggle, validation, and App export

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

// Export additional components
export {
  FocusMode, TimeSelector, SleepConfig, Form, Card, IconButton, 
  AnalogClock, DayProgressBar, ThemeToggle, validate
};

// ---------- App with Theme Provider ----------
export default function App() {
  return (
    <ThemeProvider>
      <DayPlannerApp />
    </ThemeProvider>
  );
}