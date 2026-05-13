import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encodePair, decodePair, encodeBuffer, decodePoints, BYTES_PER_POINT } from '../src/lib/encoder.js';

describe('encoder', () => {
  describe('encodePair / decodePair round-trip', () => {
    it('encodes and decodes all zeros', () => {
      const [lat, lng] = encodePair(0, 0, 0);
      const out = new Uint8Array(2);
      decodePair(lat, lng, 0, out, 0);
      expect([out[0], out[1]]).toEqual([0, 0]);
    });

    it('encodes and decodes all 0xFF', () => {
      const [lat, lng] = encodePair(0xff, 0xff, 0);
      const out = new Uint8Array(2);
      decodePair(lat, lng, 0, out, 0);
      expect([out[0], out[1]]).toEqual([0xff, 0xff]);
    });

    it('encodes and decodes alternating pattern', () => {
      const [lat, lng] = encodePair(0xaa, 0x55, 0);
      const out = new Uint8Array(2);
      decodePair(lat, lng, 0, out, 0);
      expect([out[0], out[1]]).toEqual([0xaa, 0x55]);
    });

    it('round-trips random data', () => {
      for (let i = 0; i < 100; i++) {
        const bytes = randomBytes(2);
        const [lat, lng] = encodePair(bytes[0]!, bytes[1]!, 0);
        const out = new Uint8Array(2);
        decodePair(lat, lng, 0, out, 0);
        expect([out[0], out[1]]).toEqual([bytes[0], bytes[1]], `failed on iteration ${i}`);
      }
    });

    it('produces valid latitude range', () => {
      const min = encodePair(0, 0, 0);
      const max = encodePair(255, 255, 0);
      expect(min[0]).toBeGreaterThanOrEqual(39.99);
      expect(min[0]).toBeLessThanOrEqual(40.01);
      expect(max[0]).toBeGreaterThanOrEqual(39.99);
      expect(max[0]).toBeLessThanOrEqual(40.01);
    });

    it('produces valid longitude range', () => {
      const min = encodePair(0, 0, 0);
      const max = encodePair(255, 255, 0);
      expect(min[1]).toBeGreaterThanOrEqual(-120.01);
      expect(min[1]).toBeLessThanOrEqual(-119.99);
      expect(max[1]).toBeGreaterThanOrEqual(-120.01);
      expect(max[1]).toBeLessThanOrEqual(-119.99);
    });

    it('different indices produce different baselines', () => {
      const [lat0, lng0] = encodePair(0, 0, 0);
      const [lat1, lng1] = encodePair(0, 0, 1);
      expect(lat0).not.toBe(lat1);
      expect(lng0).not.toBe(lng1);
    });

    it('index does not affect decode', () => {
      const bytes = [0x42, 0x99];
      const [lat, lng] = encodePair(bytes[0]!, bytes[1]!, 5);
      const out = new Uint8Array(2);
      decodePair(lat, lng, 5, out, 0);
      expect([out[0], out[1]]).toEqual([0x42, 0x99]);
    });
  });

  describe('encodeBuffer / decodePoints round-trip', () => {
    it('handles empty buffer', () => {
      const data = new Uint8Array(0);
      const points = encodeBuffer(data);
      expect(points.length).toBe(0);
      const decoded = decodePoints(points, 0);
      expect(decoded.length).toBe(0);
    });

    it('handles single byte', () => {
      const data = new Uint8Array([0x41]);
      const points = encodeBuffer(data);
      expect(points.length).toBe(1);
      const decoded = decodePoints(points, 1);
      expect(decoded[0]).toBe(0x41);
    });

    it('handles exact 2-byte data', () => {
      const data = new Uint8Array([0x01, 0x02]);
      const points = encodeBuffer(data);
      expect(points.length).toBe(1);
      const decoded = decodePoints(points, 2);
      expect([...decoded]).toEqual([0x01, 0x02]);
    });

    it('handles odd-length data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const points = encodeBuffer(data);
      expect(points.length).toBe(3);
      const decoded = decodePoints(points, 5);
      expect([...decoded]).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles large random data', () => {
      const data = new Uint8Array(randomBytes(2000));
      const points = encodeBuffer(data);
      const decoded = decodePoints(points, data.length);
      expect([...decoded]).toEqual([...data]);
    });
  });
});
