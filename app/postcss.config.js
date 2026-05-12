// PostCSS processes the CSS before it reaches the browser.
// These two plugins are required for Tailwind to work with Vite.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
