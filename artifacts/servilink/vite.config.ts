import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "icon-*.png",
        "icon-maskable-*.png",
      ],
      manifest: {
        name: "LinkServi - Marketplace de Servicios",
        short_name: "LinkServi",
        description: "Conectamos clientes con trabajadores profesionales en Venezuela",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait-primary",
        scope: basePath,
        start_url: basePath,
        lang: "es",
        categories: ["business", "utilities"],
        icons: [
          { src: "icon-72.png", sizes: "72x72", type: "image/png" },
          { src: "icon-96.png", sizes: "96x96", type: "image/png" },
          { src: "icon-128.png", sizes: "128x128", type: "image/png" },
          { src: "icon-144.png", sizes: "144x144", type: "image/png" },
          { src: "icon-152.png", sizes: "152x152", type: "image/png" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-384.png", sizes: "384x384", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [],
      },
      devOptions: {
        // Desactivado en dev: el SW cachea bundles viejos y crea problemas
        // de "código fantasma" donde el navegador sigue mostrando JS antiguo
        // aunque el servidor ya tenga el nuevo. En producción el SW funciona
        // normal porque los bundles tienen hashes únicos por build.
        enabled: false,
        type: "module",
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["wouter"],
          query: ["@tanstack/react-query"],
          maps: ["@googlemaps/js-api-loader", "@googlemaps/markerclusterer"],
          charts: ["recharts"],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "wouter",
      "@tanstack/react-query",
      "@tanstack/react-virtual",
      "framer-motion",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-toast",
      "@radix-ui/react-dialog",
      "@radix-ui/react-slot",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-popover",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-progress",
      "@radix-ui/react-separator",
      "@radix-ui/react-label",
      "@radix-ui/react-avatar",
      "sonner",
      "next-themes",
      "date-fns",
      "zod",
      "react-hook-form",
      "@hookform/resolvers/zod",
    ],
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
