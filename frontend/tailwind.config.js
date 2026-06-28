/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0b1221',
        surface:  '#111827',
        surface2: '#1a2236',
        surface3: '#1e2d40',
        border:   '#1e3a5f',
        border2:  '#2a4a6b',
        accent:   '#3b82f6',
        accent2:  '#1d4ed8',
        gold:     '#f59e0b',
        danger:   '#ef4444',
        success:  '#10b981',
        teal:     '#06b6d4',
        muted:    '#64748b',
        sub:      '#94a3b8',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
