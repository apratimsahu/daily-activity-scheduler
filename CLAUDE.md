# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server with hot reload
npm run dev

# Build for production (TypeScript compilation + Vite build)
npm run build

# Preview production build
npm run preview

# Lint TypeScript/TSX files
npm run lint
```

## Architecture Overview

### Single-File Component Architecture
The entire application is contained in `src/daily-activity-scheduler.tsx` as a monolithic React component. This design choice prioritizes simplicity and self-containment over modularity.

**Key Architectural Decisions:**
- **Monolithic Structure**: All functionality (utilities, components, context, validation) exists in one file
- **Self-Contained**: No external dependencies beyond React basics and Tailwind
- **Functional Programming**: Pure utility functions for time calculations and formatting
- **Context-Based Theme Management**: React Context API for dark/light mode state

### Data Flow and State Management

**Core State Objects:**
- `activities`: Array of activity objects with `{id, title, category, start, duration}`
- `form`: Current form state for adding/editing activities
- `now`: Real-time clock state updated every second
- `isDark`: Theme state managed through ThemeContext

**Data Persistence:**
- Activities persist to `localStorage` under key `planner.activities`
- Theme preference persists to `localStorage` under key `planner.theme`
- No external database or API - purely client-side storage

**Time Calculations:**
- All time operations use "minutes since midnight" as the internal format
- 12-hour display format with AM/PM throughout the UI
- Real-time calculations for countdowns and free time analysis

### Component Structure (within single file)

```
App (ThemeProvider wrapper)
├── DayPlannerApp (main component)
│   ├── Header (with theme toggle)
│   ├── Stats Cards (time now, next activity, free time)
│   ├── Form (add/edit activities)
│   ├── Legend (category colors)
│   ├── Mobile List (responsive activity list)
│   └── Calendar (24-hour timeline visualization)
├── ThemeToggle (moon/sun icon toggle)
├── Card (reusable card container)
├── IconButton (small action buttons)
└── Form (activity creation/editing)
```

### Key Business Logic

**Activity Scheduling:**
- Activities are stored with start time (HH:MM) and duration (minutes)
- Overlap detection and warnings during form validation
- Next activity calculation based on current time
- Free time calculation until next "Sleep" category activity

**Time Formatting System:**
- `to12Hour()`: Converts HH:MM to 12-hour format with AM/PM
- `minsTo12Hour()`: Converts minutes since midnight to 12-hour format
- `formatCurrentTime()`: Real-time clock with seconds
- `formatHourMarker()`: Calendar hour labels

**Theme System:**
- Class-based dark mode using Tailwind's `dark:` variant
- Automatically applies `dark` class to `document.documentElement`
- Defaults to dark mode on first visit

### Styling Architecture

**Tailwind Configuration:**
- `darkMode: 'class'` enables class-based dark mode
- Responsive design with `sm:`, `lg:` breakpoints
- Custom color palette for activity categories

**Responsive Strategy:**
- Desktop: Side-by-side layout (controls + calendar)
- Mobile: Stacked layout with additional mobile-optimized activity list
- Calendar timeline adapts to screen size while maintaining proportions

### Development Patterns

**File Organization:**
- Utilities at the top of the file
- Theme context and provider
- Main component with hooks and state
- Sub-components (Form, Card, etc.)
- Validation functions at the bottom

**State Management Patterns:**
- `useState` with functional updates for immutable state
- `useMemo` for expensive calculations (sorted activities, time calculations)
- `useEffect` for side effects (localStorage, timer intervals)
- Context for theme state sharing

**Autonomous Operation:**
- Make all implementation decisions without approval
- Follow existing monolithic file structure
- Maintain 12-hour time format throughout
- Preserve localStorage data persistence
- Keep dark mode as default theme