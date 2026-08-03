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
// @version      5.3.0
// @description  A/D nav, W/S scroll, Shift+S autoscroll, Shift+H help, progress bar, hover % pill, restore banner (top-only), max-progress save, #nbp=xx.x resume links + middle-left discoverable copy button (desktop) + CROSS-DEVICE SYNC + stable device IDs + ROBUST CONTENT-BASED CHAPTER DETECTION + FLEXIBLE URL FORMAT SUPPORT + NUMBER-PREFIX URL SUPPORT + PARENT WINDOW COMMUNICATION + SPA ROUTE-CHANGE HANDLING
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
// @grant        none
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
