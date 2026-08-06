// Minimal ambient declaration for the one GM_* API this userscript uses.
// No @types/tampermonkey dependency for a single function.
declare function GM_xmlhttpRequest(details: {
  method: 'GET' | 'POST';
  url: string;
  responseType?: 'arraybuffer';
  headers?: Record<string, string>;
  timeout?: number;
  onload?: (response: { status: number; response: ArrayBuffer }) => void;
  onerror?: (error: unknown) => void;
  ontimeout?: () => void;
}): void;
