/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tell Tailwind which files to scan for class names.
  // It removes unused styles from the final build, keeping the CSS small.
  content: ['./src/**/*.{html,tsx,ts}'],

  theme: {
    extend: {
      keyframes: {
        slide: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        slide: 'slide 1.4s ease-in-out infinite',
      },
    },
  },

  plugins: [
    // Typography plugin adds the `prose` classes used by DocsPage to style markdown
    require('@tailwindcss/typography'),
  ],
}
