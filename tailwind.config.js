/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'color-mix(in srgb, var(--bg-secondary) calc(<alpha-value> * 100%), transparent)',
          tertiary: 'color-mix(in srgb, var(--bg-tertiary) calc(<alpha-value> * 100%), transparent)',
          elevated: 'var(--bg-elevated)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          disabled: 'var(--text-disabled)',
          display: 'var(--text-display)',
          inverse: 'var(--text-inverse)',
        },
        border: {
          DEFAULT: 'var(--border-color)',
          subtle: 'var(--border-subtle)',
          visible: 'var(--border-visible)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          subtle: 'var(--accent-subtle)',
        },
        activity: 'var(--activity)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        interactive: 'var(--interactive)',
        statusbar: {
          bg: 'var(--statusbar-bg)',
          text: 'var(--statusbar-text)',
        },
        hover: {
          bg: 'var(--hover-bg)',
        },
        active: {
          bg: 'var(--active-bg)',
        },
        danger: {
          DEFAULT: 'color-mix(in srgb, var(--danger) calc(<alpha-value> * 100%), transparent)',
          hover: 'var(--danger-hover)',
        },
        shadow: 'var(--shadow)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
}
