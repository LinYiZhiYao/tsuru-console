/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 浅色主题：底用暖灰白，层次靠细描边
        ink: {
          950: '#12171f',
          900: '#1c222c',
          850: '#2c3543',
          800: '#3d4655',
          750: '#5b6473',
          700: '#8b94a3',
          600: '#a8b0bd',
          500: '#c4cad3',
        },
        surface: {
          root: '#f4f6f8',
          panel: '#ffffff',
          raised: '#fafbfc',
          hover: '#f0f2f5',
          inset: '#eef1f4',
        },
        accent: {
          400: '#22b98a',
          500: '#0f9d70',
          600: '#0c8a61',
        },
        cyan: {
          400: '#22b8d0',
          500: '#0891a8',
        },
        violet: {
          400: '#8b72e8',
          500: '#7454d8',
        },
        amber: {
          400: '#e0900f',
          500: '#d97706',
        },
        rose: {
          400: '#e5405e',
          500: '#dc2f4b',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl2: '14px',
        xl3: '20px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(16,24,40,0.05)',
        panel: '0 2px 8px -2px rgba(16,24,40,0.08), 0 1px 3px rgba(16,24,40,0.04)',
        float: '0 24px 64px -20px rgba(16,24,40,0.24)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};
