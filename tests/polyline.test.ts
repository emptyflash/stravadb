import { describe, it, expect } from 'vitest';
import { encode, decode } from '../src/lib/polyline.js';
import { encodePair, decodePair } from '../src/lib/encoder.js';

describe('polyline', () => {
  it('round-trips a simple polyline', () => {
    const points: [number, number][] = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    const encoded = encode(points);
    const decoded = decode(encoded);
    expect(decoded.length).toBe(points.length);
    for (let i = 0; i < points.length; i++) {
      expect(decoded[i]![0]).toBeCloseTo(points[i]![0]!, 5);
      expect(decoded[i]![1]).toBeCloseTo(points[i]![1]!, 5);
    }
  });

  it('preserves precision for encoded data points', () => {
    for (let i = 0; i < 50; i++) {
      const b0 = Math.floor(Math.random() * 256);
      const b1 = Math.floor(Math.random() * 256);
      const [lat, lng] = encodePair(b0, b1, i);
      const encoded = encode([[lat, lng]]);
      const decoded = decode(encoded);
      expect(decoded.length).toBe(1);
      const out = new Uint8Array(2);
      decodePair(decoded[0]![0], decoded[0]![1], i, out, 0);
      expect([out[0], out[1]]).toEqual([b0, b1]);
    }
  });

  it('handles empty points array', () => {
    const encoded = encode([]);
    const decoded = decode(encoded);
    expect(decoded.length).toBe(0);
  });

  it('handles single point', () => {
    const points: [number, number][] = [[0, 0]];
    const encoded = encode(points);
    const decoded = decode(encoded);
    expect(decoded.length).toBe(1);
    expect(decoded[0]![0]).toBeCloseTo(0, 5);
    expect(decoded[0]![1]).toBeCloseTo(0, 5);
  });

  it('handles extreme coordinates', () => {
    const points: [number, number][] = [
      [-90, -180],
      [90, 180],
      [0, 0],
    ];
    const encoded = encode(points);
    const decoded = decode(encoded);
    expect(decoded.length).toBe(3);
    expect(decoded[0]![0]).toBeCloseTo(-90, 5);
    expect(decoded[0]![1]).toBeCloseTo(-180, 5);
    expect(decoded[1]![0]).toBeCloseTo(90, 5);
    expect(decoded[1]![1]).toBeCloseTo(180, 5);
  });
});
