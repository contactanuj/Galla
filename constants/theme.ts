export const COLORS = {
  primary: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
    400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
    800: '#1e40af', 900: '#1e3a8a',
  },
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
    400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
    800: '#1e293b', 900: '#0f172a',
  },
  success: { light: '#dcfce7', DEFAULT: '#16a34a', dark: '#166534' },
  warning: { light: '#fef3c7', DEFAULT: '#d97706', dark: '#92400e' },
  error:   { light: '#fee2e2', DEFAULT: '#dc2626', dark: '#991b1b' },
  amber:   { light: '#fef3c7', DEFAULT: '#f59e0b', dark: '#92400e' },
} as const;

export const BREAKPOINTS = { compact: 640, tablet: 1024 } as const;

export const TOUCH_TARGET = 44;

export const RADIUS = { sm: 6, md: 8, lg: 12, xl: 16 } as const;

export const SPACING = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32,
} as const;

export const FONT_SIZE = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24,
} as const;
