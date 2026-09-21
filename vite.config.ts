import { fileURLToPath, URL } from "node:url";

/**
 * The desktop app ships the same renderer, minus the parts that only make sense on the web:
 * Google Analytics (a program that phones home on launch is a different bargain than a web page),
 * and the PWA plumbing, which `services/platform.ts` already skips under Electron
 */
const stripWebOnlyTags = {
  name: "strip-web-only-tags",
  transformIndexHtml: (html: string) =>
    html
      .replace(/<script async src="https:\/\/www\.googletagmanager\.com[^>]*><\/script>\s*/, "")
      .replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>\s*/, "")
      .replace(/<link rel="manifest"[^>]*>\s*/, "")
};

export default ({ mode }: { mode: string }) => {
  const isElectron = mode === "electron";

  return {
    root: "./src",
    base: isElectron ? "./" : process.env.NETLIFY ? "/" : "/Fantasy-Map-Generator/",
    plugins: isElectron ? [stripWebOnlyTags] : [],
    build: {
      outDir: isElectron ? "../dist-electron/renderer" : "../dist",
      assetsDir: "./",
      emptyOutDir: true, // outDir sits outside root, so Vite would otherwise keep every past build's chunks
      sourcemap: false, // maps are dead weight in a shipped bundle; the packaged app keeps DevTools regardless
      // minify stays at the Vite default (oxc): faster than esbuild, same output quality
      reportCompressedSize: false, // gzipping the report doubles build time, the output is identical
      chunkSizeWarningLimit: 2000, // the map bundle is big by nature; a warning per build helps no one
      // the desktop Chromium is evergreen, so skip the legacy downleveling the web build needs
      ...(isElectron ? { target: "chrome120" } : {})
    },
    publicDir: "../public",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    }
  };
};
