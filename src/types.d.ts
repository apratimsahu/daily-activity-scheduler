// Type declarations for daily-activity-scheduler.tsx

interface Activity {
  id: string;
  title: string;
  category: string;
  start: string;
  duration: number;
}

interface FormState {
  title: string;
  category: string;
  start: string;
  duration: string;
  editingId: string | null;
}

interface SleepConfig {
  bedtime: string;
  wakeupTime: string;
}

interface TimerState {
  isRunning: boolean;
  seconds: number;
  activityId: string | null;
}

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

// Global declarations to suppress TypeScript errors
declare const pad: (n: number) => string;
declare const toMinutes: (hhmm: string) => number;
declare const toHHMM: (mins: number) => string;
declare const clamp: (v: number, a: number, b: number) => number;
declare const to12Hour: (timeStr: string) => string;
declare const minsTo12Hour: (mins: number) => string;
declare const formatCurrentTime: (date: Date) => string;
declare const formatHourMarker: (hour: number) => string;
declare const overlaps: (a1: number, a2: number, b1: number, b2: number) => boolean;
declare const closestSleep: (mins: number) => number;