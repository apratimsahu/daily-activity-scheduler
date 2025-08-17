# Daily Activity Scheduler

A modern, intuitive daily activity planner built with React and TypeScript. Plan your day with a visual 24-hour timeline, track your activities, and manage your time effectively with real-time countdowns and free time calculations.

## ✨ Features

### 📅 Visual Timeline
- **24-hour calendar view** with draggable activity blocks
- **Real-time "now" indicator** showing current time position
- **Color-coded categories** for easy activity identification
- **Responsive design** that works on desktop and mobile

### ⏰ Smart Time Management
- **Real-time countdown** to your next activity
- **Free time calculation** until your next sleep period
- **12-hour format display** with AM/PM throughout the app
- **Activity duration tracking** with overlap detection

### 🎨 Modern Interface
- **Dark mode by default** with sun/moon toggle
- **Tailwind CSS styling** for a clean, modern look
- **Responsive layout** that adapts to any screen size
- **Keyboard-friendly** form interactions

### 💾 Data Persistence
- **Local storage** automatically saves your activities
- **Theme preference** remembers your dark/light mode choice
- **No external dependencies** - works completely offline

## 🚀 Quick Start

### Prerequisites
- Node.js (version 16 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/apratimsahu/daily-activity-scheduler.git
   cd daily-activity-scheduler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173` to see the app running.

### Build for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

## 🎯 How to Use

### Adding Activities
1. Fill out the **Add Activity** form with:
   - **Title**: Custom name for your activity (optional)
   - **Category**: Choose from predefined categories (Work, Sleep, Gym, etc.)
   - **Start Time**: When the activity begins
   - **Duration**: How long the activity lasts (in minutes)

2. Click **Add** to create the activity

### Managing Activities
- **Edit**: Click any activity block on the calendar or list item to edit
- **Delete**: Use the delete button (🗑️) on mobile list items
- **Visual feedback**: Activities show start/end times and duration on hover

### Understanding the Dashboard
- **Time Now**: Current time with seconds, updates in real-time
- **Next Activity**: Countdown timer to your upcoming activity
- **Free Time**: Available time before your next sleep period

### Theme Toggle
- Click the **sun/moon icon** in the header to switch between light and dark modes
- Your preference is automatically saved

## 🏗️ Technical Details

### Built With
- **React 19** - UI framework
- **TypeScript** - Type safety and better development experience
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Fast build tool and development server

### Architecture
- **Single-file component** design for simplicity
- **React Context** for theme management
- **Local storage** for data persistence
- **Real-time updates** with setInterval for live countdowns

### Key Features Implementation
- **Time calculations** use "minutes since midnight" internally
- **12-hour display** with comprehensive AM/PM formatting
- **Responsive design** with mobile-optimized activity list
- **Dark mode** using Tailwind's class-based approach

## 🎨 Customization

### Activity Categories
The app includes predefined categories with color coding:
- 🛏️ **Sleep** - Slate gray
- 💼 **Work** - Blue
- 🏃 **Gym** - Green
- 📚 **Study** - Pink
- 🚗 **Commute** - Amber
- 🎮 **Leisure** - Cyan
- 🍽️ **Meal** - Rose
- 📋 **Other** - Violet

### Modifying Categories
To add or modify categories, update the `CATEGORY_COLORS` object in `src/daily-activity-scheduler.tsx`.

## 📱 Browser Support

- **Modern browsers** (Chrome, Firefox, Safari, Edge)
- **Mobile browsers** with responsive design
- **Local storage** required for data persistence

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with modern web technologies
- Inspired by the need for simple, effective daily planning
- Designed for productivity and ease of use

---

**Tip**: Your activities and theme preferences are saved locally in your browser. The app works completely offline once loaded!