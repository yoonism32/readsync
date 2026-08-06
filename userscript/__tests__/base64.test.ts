import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64 } from '../src/utils/base64.js';

describe('arrayBufferToBase64', () => {
  it('encodes an empty buffer to an empty string', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('encodes known bytes to the expected base64', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(arrayBufferToBase64(bytes.buffer)).toBe('SGVsbG8=');
  });

  it('round-trips arbitrary binary data, including a JPEG SOI marker', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const encoded = arrayBufferToBase64(bytes.buffer);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
