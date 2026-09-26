// ==================================================================
// FILE TYPE : BUILD CONFIG
// PURPOSE   :
//   Vite build/dev-server configuration (React plugin only).
// ==================================================================
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
