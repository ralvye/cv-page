/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: { DEFAULT: '#A8D6F0', deep: '#8FCBEE' },
        navy: { DEFAULT: '#14202E', soft: '#4A5B6E' },
        signal: '#1FD65F',
        build: { DEFAULT: '#3E9BE0', deep: '#2B7BC4' },
        deploy: { DEFAULT: '#4DB35A', deep: '#1F8A4C' },
        prod: { DEFAULT: '#FFC400', deep: '#B38600' },
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
