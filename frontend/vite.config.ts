import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  // Bind to IPv4 so Wails' Go dev-server health check (which resolves
  // `localhost` to 127.0.0.1 on Windows) can connect. Vite defaults to
  // the IPv6 loopback (::1), which leaves the Go client unable to connect
  // and the app fatals with "unable to connect to frontend server".
  server: {
    host: "127.0.0.1",
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
