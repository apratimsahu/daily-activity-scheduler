@echo off
echo ========================================
echo React Application Launcher
echo ========================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Get current directory
set CURRENT_DIR=%~dp0
cd /d "%CURRENT_DIR%"

:: Check if package.json exists (project already initialized)
if exist "package.json" (
    echo Project already initialized. Starting the app...
    call npm run dev
    pause
    exit /b 0
)

:: Find TSX file in current directory
set TSX_FILE=
for %%f in (*.tsx) do (
    set TSX_FILE=%%f
    goto :found_tsx
)

:found_tsx
if "%TSX_FILE%"=="" (
    echo ERROR: No .tsx file found in current directory!
    echo Please ensure there is a .tsx file in the same folder as this batch file.
    pause
    exit /b 1
)

echo Found TSX file: %TSX_FILE%
echo.

echo Initializing React project in current directory...
echo This might take a few minutes on first run...
echo.

:: Initialize package.json
call npm init -y

echo.
echo Installing Vite and React dependencies...
call npm install --save-dev vite @vitejs/plugin-react
call npm install react react-dom
call npm install --save-dev @types/react @types/react-dom typescript

echo.
echo Installing common dependencies...
call npm install recharts lucide-react

echo.
echo Installing Tailwind CSS...
call npm install -D tailwindcss@3.4.0 postcss@8.4.31 autoprefixer@10.4.16
call npx tailwindcss init

:: Create vite.config.ts
echo import { defineConfig } from 'vite' > vite.config.ts
echo import react from '@vitejs/plugin-react' >> vite.config.ts
echo. >> vite.config.ts
echo export default defineConfig({ >> vite.config.ts
echo   plugins: [react()], >> vite.config.ts
echo   server: { >> vite.config.ts
echo     hmr: { >> vite.config.ts
echo       overlay: false >> vite.config.ts
echo     } >> vite.config.ts
echo   } >> vite.config.ts
echo }) >> vite.config.ts

:: Create tsconfig.json
echo { > tsconfig.json
echo   "compilerOptions": { >> tsconfig.json
echo     "target": "ES2020", >> tsconfig.json
echo     "useDefineForClassFields": true, >> tsconfig.json
echo     "lib": ["ES2020", "DOM", "DOM.Iterable"], >> tsconfig.json
echo     "module": "ESNext", >> tsconfig.json
echo     "skipLibCheck": true, >> tsconfig.json
echo     "moduleResolution": "bundler", >> tsconfig.json
echo     "allowImportingTsExtensions": true, >> tsconfig.json
echo     "resolveJsonModule": true, >> tsconfig.json
echo     "isolatedModules": true, >> tsconfig.json
echo     "noEmit": true, >> tsconfig.json
echo     "jsx": "react-jsx", >> tsconfig.json
echo     "strict": true, >> tsconfig.json
echo     "noUnusedLocals": true, >> tsconfig.json
echo     "noUnusedParameters": true, >> tsconfig.json
echo     "noFallthroughCasesInSwitch": true >> tsconfig.json
echo   }, >> tsconfig.json
echo   "include": ["src"], >> tsconfig.json
echo   "references": [{ "path": "./tsconfig.node.json" }] >> tsconfig.json
echo } >> tsconfig.json

:: Create tsconfig.node.json
echo { > tsconfig.node.json
echo   "compilerOptions": { >> tsconfig.node.json
echo     "composite": true, >> tsconfig.node.json
echo     "skipLibCheck": true, >> tsconfig.node.json
echo     "module": "ESNext", >> tsconfig.node.json
echo     "moduleResolution": "bundler", >> tsconfig.node.json
echo     "allowSyntheticDefaultImports": true >> tsconfig.node.json
echo   }, >> tsconfig.node.json
echo   "include": ["vite.config.ts"] >> tsconfig.node.json
echo } >> tsconfig.node.json

:: Create tailwind.config.js
echo /** @type {import('tailwindcss').Config} */ > tailwind.config.js
echo module.exports = { >> tailwind.config.js
echo   content: [ >> tailwind.config.js
echo     "./index.html", >> tailwind.config.js
echo     "./src/**/*.{js,ts,jsx,tsx}", >> tailwind.config.js
echo   ], >> tailwind.config.js
echo   theme: { >> tailwind.config.js
echo     extend: {}, >> tailwind.config.js
echo   }, >> tailwind.config.js
echo   plugins: [], >> tailwind.config.js
echo } >> tailwind.config.js

:: Create postcss.config.cjs
echo module.exports = { > postcss.config.cjs
echo   plugins: { >> postcss.config.cjs
echo     tailwindcss: {}, >> postcss.config.cjs
echo     autoprefixer: {}, >> postcss.config.cjs
echo   }, >> postcss.config.cjs
echo } >> postcss.config.cjs

:: Create src directory if it doesn't exist
if not exist "src" mkdir src

:: Create index.css with Tailwind directives
echo @tailwind base; > src\index.css
echo @tailwind components; >> src\index.css
echo @tailwind utilities; >> src\index.css

:: Move the TSX file to src with same name
echo.
echo Setting up your React application...
move /Y "%TSX_FILE%" "src\%TSX_FILE%" >nul
echo Moved %TSX_FILE% to src\%TSX_FILE%

:: Get filename without extension for import
for %%f in ("%TSX_FILE%") do set TSX_NAME=%%~nf

:: Create main.tsx with dynamic import
echo import React from 'react' > src\main.tsx
echo import ReactDOM from 'react-dom/client' >> src\main.tsx
echo import App from './%TSX_NAME%' >> src\main.tsx
echo import './index.css' >> src\main.tsx
echo. >> src\main.tsx
echo ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render( >> src\main.tsx
echo   ^<React.StrictMode^> >> src\main.tsx
echo     ^<App /^> >> src\main.tsx
echo   ^</React.StrictMode^>, >> src\main.tsx
echo ) >> src\main.tsx

:: Create index.html
echo ^<!doctype html^> > index.html
echo ^<html lang="en"^> >> index.html
echo   ^<head^> >> index.html
echo     ^<meta charset="UTF-8" /^> >> index.html
echo     ^<link rel="icon" type="image/svg+xml" href="/vite.svg" /^> >> index.html
echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0" /^> >> index.html
echo     ^<title^>React App^</title^> >> index.html
echo   ^</head^> >> index.html
echo   ^<body^> >> index.html
echo     ^<div id="root"^>^</div^> >> index.html
echo     ^<script type="module" src="/src/main.tsx"^>^</script^> >> index.html
echo   ^</body^> >> index.html
echo ^</html^> >> index.html

:: Update package.json with scripts
echo.
echo Updating package.json scripts...
call npm pkg set scripts.dev="vite"
call npm pkg set scripts.build="tsc && vite build"
call npm pkg set scripts.preview="vite preview"
call npm pkg set scripts.lint="eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
call npm pkg set type="module"

:: Create .gitignore
echo node_modules > .gitignore
echo dist >> .gitignore
echo dist-ssr >> .gitignore
echo *.local >> .gitignore
echo .vite >> .gitignore

:: Create vite-env.d.ts
echo /// ^<reference types="vite/client" /^> > src\vite-env.d.ts

echo.
echo ========================================
echo Setup complete! Starting the app...
echo ========================================
echo.
echo The app will open at http://localhost:5173
echo Press Ctrl+C to stop the server
echo.

:: Start the development server
call npm run dev

pause