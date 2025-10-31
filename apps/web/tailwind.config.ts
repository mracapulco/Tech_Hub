import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        primaryHover: '#1E40AF',
        background: '#F7F9FC',
        card: '#FFFFFF',
        border: '#E5E7EB',
        text: '#111827',
        muted: '#6B7280',
        success: '#16A34A',
        warning: '#F59E0B',
        error: '#DC2626',
      },
    },
  },
  plugins: [],
};

export default config;