/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: { DEFAULT: '#7FB7D8', deep: '#5E9CC4' },
        navy: { DEFAULT: '#14202E', soft: '#4A5B6E' },
        signal: '#1FD65F',
        build: { DEFAULT: '#5B9BD5', deep: '#3E74A8' },
        deploy: { DEFAULT: '#5FAF78', deep: '#2F7A4D' },
        prod: { DEFAULT: '#E0BC62', deep: '#9C7A24' },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 10px 30px rgba(20, 32, 46, 0.18)',
        signal: '0 0 12px rgba(31, 214, 95, 0.6)',
      },
    },
  },
  plugins: [],
}
