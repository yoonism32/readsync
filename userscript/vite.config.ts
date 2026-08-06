import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function injectUserscriptHeader(header: string): Plugin {
  return {
    name: 'inject-userscript-header',
    closeBundle() {
      const outFile = path.resolve(__dirname, '../dist-userscript/readsync.user.js');
      const original = fs.readFileSync(outFile, 'utf-8');
      fs.writeFileSync(outFile, header + original);
    },
  };
}

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         ReadSync ++ NovelArrow Enhanced Navigation Helper
// @namespace    CustomNamespace
// @version      5.6.0
// @description  A/D nav, W/S scroll, Shift+S autoscroll, Shift+H help, progress bar, hover % pill, restore banner (top-only), max-progress save, #nbp=xx.x resume links + middle-left discoverable copy button (desktop) + CROSS-DEVICE SYNC + stable device IDs + ROBUST CONTENT-BASED CHAPTER DETECTION + FLEXIBLE URL FORMAT SUPPORT + NUMBER-PREFIX URL SUPPORT + PARENT WINDOW COMMUNICATION + SPA ROUTE-CHANGE HANDLING
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFLUlEQVR4AbxWe1BUZRT/3bsL7K7C4msAxUV81tRoKI6SSEwyEgJq+MCKmsawEp0my5rRtBh7jdPY1PQwZhgiC1AkTUalkfKFIhiRKKEEooDGQ+S9wMLC7Xwfy3Uv3P2L3J37ne+c853vO78995xzPzExMVHcvK1sV8K263U0JCeNOuYzMVESxYa29TsFCB8C8KbhrMeb+WxsL98hErPFWV5H+JGkrSIpnfnPyZ3i8WYAFBpnCyMAWCwdOJu7Gx3t/zoFywgAeaf3oKw0Cxk/ROLShX3o7m5+qEAUAAYGrGhsLOMOrdYe/PVHMn5MXoazv32A5vuVXP9/EwUAUdRiSci7sg+dzhMeRl+UXcvEwQPROJb1Mm7d/B2SNCDbjJZRAGCHmaaFwN1jMmO5ow0vZWPlmhRM9VuCu7WFyMneisyfYnCnJp/bjJaMACAIAvymh/JzLZZ2WHo64GsKQnRMMgH5HmPdvXG/qRzZP8ejqOBbbjcaIqpt9pm8QFZ3dd2TeV/TYsTEZkBvmEA6CZcvfYWa23nEqz9Wq4WvF1z8AsePvobDaWvR2VGnMFYFMHHSHNnI0tMu84xhEXh87gbG8nGzIpfP9sTc2YC8Mx8hNSmYHL+K4stJBOQ8Wlqq4KYz2ptCFYCHcSoZCTSAPms3n+3JmLFesihR5cgCMbXV+VTCUSgtyYDJPwSLg9/C3IAX6dX5YPqMMLi4GMjqwaMKQKNxhV4/jlsNd8CUd2oL2MSHj28gnxnp6mrCr8ffQG9vJwICX8HyFfswf+EmBIfuRNzGUwha+jYzUwxRIdkJOhsADAvSjb+PoLI8h1saPf0w+5EoDP2qq86hr9fMRb1hPJ+HiEglbh85WT/EDJ9dXcdwlVaro3KU0Fh/Fbk523H61Hukl2D0NCFy9X6waMH202jdbBxw7Uo6WBXJCgeMIgJtrdWUPB/zFmw2N/It+ef3giVTVkYsKm6c4LoFi17H+rhf4DnOn8tDZJr/U1Qhg/+8va2WJ2BPT9vQsuqsAGAwTEQTtWIWSost+7UUAf+Zy+j9bYeWeHaKXj+ekknPWMVwdXNH2DOfQdS4cH1DXQmOHnqePmx3uaxGFABcKOzPxqaBdT8vnye4fXjUlwgN28OTKmBhPNddKUpBf38v54eTqX5PIiL6awI7CLCluQpHDr2A1pbq4aZcVgDgGhuRpH4Iggid/kHdBgTG83ff2VmP6/TFtJmOmPyo/FauTYGbmwdfM1NfOHlsM6x9I0vaIYB+6mIs1IKg4YcwoqUkW/r0+4xFUeF3qgfyRSLeFMEVq/aDZT+JFIFbKL2awVjFcAigj9COpb6vsCbBRB+lOY+uQpf5HkqKU0nj+PGZMh8zZoXLBvWUE7JgYxwCYM3E3WOKzUw5BYfuAKvpYrovmDsHqwUOflqXwVxgyzqdJ5sUwyEAC5WPIwBuOiOWhX8KK11aLp7bqzjQXqi5fQEV5SdsKkHRtGxKqALo7+/j7dTDqB4BttnXFITAxQmo/OckXVLO4M/CJBxOX8fvCznZW5CeGkF9YBPPE43Glbfjyb4L2VbFUAVgoXuAl/c8qG2w3x24KIF/aGqr8/DYvFiYKD8GBvroHtkKw5hJmDk7AkFL3+HfgbkBcfZbZV4VgIG+92ueO4jxE2bJhmqMIAj8n4VQZejo/S5a8ia15yS6M6Rh9boDWB75OfWPjTxf1PYznSoAtuCswQDUO8uZip96UYL0jcqCU1TMt+hlzPwEgrCLPD6USNC5ak89Od/NfP8HAAD//6LrqFEAAAAGSURBVAMASp3t203RfmkAAAAASUVORK5CYII=
// @match        https://novelarrow.com/novel/*
// @match        https://www.novelarrow.com/novel/*
// @match        https://novelarrow.com/chapter/*/*
// @match        https://www.novelarrow.com/chapter/*/*
// @match        https://novelbin.com/b/*/*chapter-*
// @match        https://www.novelbin.com/b/*/*chapter-*
// @match        https://novelbin.me/b/*/*chapter-*
// @match        https://www.novelbin.me/b/*/*chapter-*
// @match        https://novelbin.net/b/*/*chapter-*
// @match        https://www.novelbin.net/b/*/*chapter-*
// @match        https://novelbin.org/b/*/*chapter-*
// @match        https://www.novelbin.org/b/*/*chapter-*
// @match        https://novelbin.com/b/*/*chapter*
// @match        https://www.novelbin.com/b/*/*chapter*
// @match        https://novelbin.me/b/*/*chapter*
// @match        https://www.novelbin.me/b/*/*chapter*
// @match        https://novelbin.net/b/*/*chapter*
// @match        https://www.novelbin.net/b/*/*chapter*
// @match        https://novelbin.org/b/*/*chapter*
// @match        https://www.novelbin.org/b/*/*chapter*
// @match        https://novelbin.com/b/*
// @match        https://www.novelbin.com/b/*
// @match        https://novelbin.me/b/*
// @match        https://www.novelbin.me/b/*
// @match        https://novelbin.net/b/*
// @match        https://www.novelbin.net/b/*
// @match        https://novelbin.org/b/*
// @match        https://www.novelbin.org/b/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// ==/UserScript==
`;

export default defineConfig({
  plugins: [injectUserscriptHeader(USERSCRIPT_HEADER)],
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'ReadSyncUserscript',
      formats: ['iife'],
      fileName: () => 'readsync.user.js',
    },
    outDir: '../dist-userscript',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {},
  },
});
