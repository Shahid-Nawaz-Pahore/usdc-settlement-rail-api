// CRA doesn't read a project postcss.config.js, so CRACO injects Tailwind +
// autoprefixer into CRA's PostCSS pipeline without ejecting.
module.exports = {
  style: {
    postcss: {
      plugins: [require('tailwindcss'), require('autoprefixer')],
    },
  },
};
