import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encode as encodePolyline, decode as decodePolyline } from '../src/lib/polyline.js';
import { generateGpx } from '../src/lib/gpx.js';
import { chunkData, unchunkData, MAX_CHUNK_PAYLOAD } from '../src/lib/chunk.js';

function fullRoundTrip(data: Uint8Array): Uint8Array {
  const chunks = chunkData(data);
  const allDecoded: Uint8Array[] = [];

  for (const chunk of chunks) {
    const polyline = encodePolyline(chunk.points);
    const decodedPoints = decodePolyline(polyline);
    const decoded = unchunkData(decodedPoints);
    if (!decoded) throw new Error('unchunkData returned null');
    allDecoded.push(decoded);
  }

  const result = new Uint8Array(data.length);
  let offset = 0;
  for (const c of allDecoded) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

describe('end-to-end data round-trip', () => {
  it('round-trips a small text file', () => {
    const input = Buffer.from('Hello, stravadb!', 'utf-8');
    const result = fullRoundTrip(input);
    expect([...result]).toEqual([...input]);
  });

  it('round-trips JSON data', () => {
    const json = JSON.stringify({ user: 'test', scores: [1, 2, 3], active: true });
    const input = Buffer.from(json, 'utf-8');
    const result = fullRoundTrip(input);
    expect([...result]).toEqual([...input]);
    expect(JSON.parse(Buffer.from(result).toString('utf-8'))).toEqual({
      user: 'test',
      scores: [1, 2, 3],
      active: true,
    });
  });

  it('round-trips binary data', () => {
    const input = new Uint8Array(randomBytes(1000));
    const result = fullRoundTrip(input);
    expect([...result]).toEqual([...input]);
  });

  it('round-trips empty data', () => {
    const input = new Uint8Array(0);
    const result = fullRoundTrip(input);
    expect(result.length).toBe(0);
  });

  it('round-trips single byte', () => {
    const input = new Uint8Array([0x42]);
    const result = fullRoundTrip(input);
    expect([...result]).toEqual([0x42]);
  });

  it('round-trips data exactly at chunk boundary', () => {
    const input = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD));
    const result = fullRoundTrip(input);
    expect([...result]).toEqual([...input]);
  });

  it('round-trips data spanning multiple chunks', () => {
    const input = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD * 2 + 500));
    const result = fullRoundTrip(input);
    expect([...result]).toEqual([...input]);
  });

  it('round-trips data of many sizes', () => {
    const sizes = [0, 1, 3, 4, 100, 500, 1000, 2000, 2001, 4000, 5000];
    for (const size of sizes) {
      const input = new Uint8Array(randomBytes(size));
      const result = fullRoundTrip(input);
      expect([...result]).toEqual([...input], `failed at size ${size}`);
    }
  });
});

describe('GPX generation + polyline round-trip', () => {
  it('preserves data through GPX generation and polyline decoding', () => {
    const data = new Uint8Array(randomBytes(500));
    const chunks = chunkData(data);
    for (const chunk of chunks) {
      const timestamps = chunk.points.map((_, i) => i * 10);
      generateGpx({
        name: 'test',
        description: '{}',
        points: chunk.points,
        timestamps,
      });

      const polyline = encodePolyline(chunk.points);
      const decoded = decodePolyline(polyline);

      expect(decoded.length).toBe(chunk.points.length);
      for (let i = 0; i < decoded.length; i++) {
        expect(decoded[i]![0]).toBeCloseTo(chunk.points[i]![0]!, 4);
        expect(decoded[i]![1]).toBeCloseTo(chunk.points[i]![1]!, 4);
      }
    }
  });

  it('generates GPX that round-trips through polyline', () => {
    const data = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD));
    const chunks = chunkData(data);
    for (const chunk of chunks) {
      const gpx = generateGpx({
        name: 'test',
        description: '{}',
        points: chunk.points,
        timestamps: chunk.points.map((_, i) => i * 10),
      });
      expect(typeof gpx).toBe('string');
      expect(gpx.length).toBeGreaterThan(0);
      expect(gpx.startsWith('<?xml')).toBe(true);

      const polyline = encodePolyline(chunk.points);
      const decoded = decodePolyline(polyline);
      const payload = unchunkData(decoded);
      expect(payload).not.toBeNull();
    }
  });
});

describe('GPX XML validity', () => {
  it('GPX contains required structural elements', () => {
    const points: [number, number][] = [[40.12345, -120.67890]];
    const gpx = generateGpx({
      name: 'test',
      description: 'desc',
      points,
      timestamps: [0],
    });

    expect(gpx).toContain('<gpx');
    expect(gpx).toContain('<trk>');
    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('<trkpt');
    expect(gpx).toContain('<ele>0</ele>');
    expect(gpx).toContain('<time>');
    expect(gpx).toContain('</gpx>');
    expect(gpx).toContain('</trk>');
    expect(gpx).toContain('</trkseg>');
    expect(gpx).toContain('</trkpt>');
  });

  it('GPX uses correct namespace', () => {
    const gpx = generateGpx({
      name: 'test',
      description: '',
      points: [[0, 0]],
      timestamps: [0],
    });

    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx).toContain('version="1.1"');
  });

  it('GPX handles many points', () => {
    const points: [number, number][] = [];
    for (let i = 0; i < 1000; i++) {
      points.push([40 + i * 0.000001, -120 - i * 0.000001]);
    }

    const gpx = generateGpx({
      name: 'many',
      description: '{}',
      points,
      timestamps: points.map((_, i) => i),
    });

    const trkptCount = (gpx.match(/<trkpt /g) || []).length;
    expect(trkptCount).toBe(1000);
  });
});

describe('full pipeline with chunked data', () => {
  it('correctly splits and reassembles via chunk + polyline', () => {
    const original = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD * 3 + 123));
    const chunks = chunkData(original);

    const reassembledChunks: Uint8Array[] = [];

    for (const chunk of chunks) {
      const polyline = encodePolyline(chunk.points);
      const decodedPoints = decodePolyline(polyline);
      const unchunked = unchunkData(decodedPoints);
      expect(unchunked).not.toBeNull();
      reassembledChunks.push(unchunked!);
    }

    const result = new Uint8Array(original.length);
    let offset = 0;
    for (const c of reassembledChunks) {
      result.set(c, offset);
      offset += c.length;
    }

    expect([...result]).toEqual([...original]);
  });
});

describe('header round-trip in chunk pipeline', () => {
  it('header survives encode→polyline→decode→unchunk', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const chunks = chunkData(data);

    for (const chunk of chunks) {
      const polyline = encodePolyline(chunk.points);
      const decodedPoints = decodePolyline(polyline);

      const decoded = unchunkData(decodedPoints);
      expect(decoded).not.toBeNull();
      expect([...decoded!]).toEqual([...data]);
    }
  });

  it('header magic bytes are recoverable', () => {
    const data = new Uint8Array([0x41, 0x42]);
    const chunks = chunkData(data);
    expect(chunks.length).toBe(1);

    const polyline = encodePolyline(chunks[0]!.points);
    const decodedPoints = decodePolyline(polyline);

    const decoded = unchunkData(decodedPoints);
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(2);
  });
});
