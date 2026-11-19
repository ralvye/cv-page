/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        petrol: {
          DEFAULT: '#1A1A1A',
          deep: '#101010',
        },
        moss: '#2F4F2F',
        carbon: '#36454F',
        neon: {
          DEFAULT: '#39FF14',
          lime: '#00FF00',
          cyan: '#00F0FF',
        },
        ink: '#F0F0F0',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(57, 255, 20, 0.55)',
      },
    },
  },
  plugins: [],
}
