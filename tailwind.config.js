// ==================================================================
// FILE TYPE : BUILD CONFIG
// PURPOSE   :
//   Tailwind CSS config — tells it which folders to scan for class names.
// ==================================================================
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./frontend/**/*.{js,jsx}",
    "./state/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
