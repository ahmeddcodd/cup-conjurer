import { defineConfig, type Plugin } from 'vite';

const YT_PLAYABLES_SDK = 'https://www.youtube.com/game_api/v1';

/** Keep SDK script tag before the game bundle in built HTML (cert: SDK before game code). */
function youtubePlayablesSdkFirst(): Plugin {
  return {
    name: 'youtube-playables-sdk-first',
    transformIndexHtml(html) {
      const sdkTag = `<script src="${YT_PLAYABLES_SDK}"></script>`;
      let out = html.replace(/<script[^>]*game_api\/v1[^>]*>\s*<\/script>\s*/gi, '');

      if (/<script[^>]*type="module"[^>]*>/i.test(out)) {
        out = out.replace(
          /(<script[^>]*type="module"[^>]*>)/i,
          `${sdkTag}\n    $1`,
        );
        return out;
      }

      return out.replace('</body>', `    ${sdkTag}\n  </body>`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base: YouTube Playables serves the bundle from a subpath, not the
  // domain root. Absolute "/assets/..." URLs would 404 there (the game would never
  // boot and FirstFrameReady would never fire). "./" makes every emitted URL
  // resolve relative to index.html wherever the host mounts it.
  base: './',
  plugins: [youtubePlayablesSdkFirst()],
  build: {
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Playables cert: filenames may only use A–Z, a–z, 0–9, _, -, .
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/chunk.js',
        assetFileNames: (assetInfo) => {
          const base = assetInfo.names?.[0] ?? 'asset';
          if (base.endsWith('.css')) return 'assets/game.css';
          const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
          const stem = ext ? base.slice(0, -ext.length) : base;
          const safeStem = stem.replace(/[^a-zA-Z0-9._-]/g, '_');
          return `assets/${safeStem}${ext}`;
        },
      },
    },
  },
});
