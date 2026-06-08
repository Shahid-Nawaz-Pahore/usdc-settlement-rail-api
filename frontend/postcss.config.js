// Used by the Tailwind CLI (npm run tw) to compile src/index.css -> src/tailwind.css.
// CRA itself ignores this file; we pre-build the CSS so Tailwind always runs.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
