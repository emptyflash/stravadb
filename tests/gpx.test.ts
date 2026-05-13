import { describe, it, expect } from 'vitest';
import { generateGpx } from '../src/lib/gpx.js';

describe('gpx', () => {
  it('generates valid GPX for simple points', () => {
    const gpx = generateGpx({
      name: 'test route',
      description: 'test desc',
      points: [[37.5, -122.2], [37.6, -122.3]],
      timestamps: [0, 10],
    });

    expect(gpx).toContain('<?xml version="1.0"');
    expect(gpx).toContain('creator="stravadb"');
    expect(gpx).toContain('<name>test route</name>');
    expect(gpx).toContain('<desc>test desc</desc>');
    expect(gpx).toContain('<trkpt lat="37.5" lon="-122.2">');
    expect(gpx).toContain('<trkpt lat="37.6" lon="-122.3">');
    expect(gpx).toContain('<ele>0</ele>');
    expect(gpx).toContain('<time>');
    expect(gpx).toContain('</gpx>');
  });

  it('escapes XML special characters in name', () => {
    const gpx = generateGpx({
      name: 'test < & " key',
      description: 'desc',
      points: [[0, 0]],
      timestamps: [0],
    });

    expect(gpx).toContain('<name>test &lt; &amp; &quot; key</name>');
  });

  it('handles empty points', () => {
    const gpx = generateGpx({
      name: 'empty',
      description: '',
      points: [],
      timestamps: [],
    });

    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('</trkseg>');
  });

  it('generates GPX with encoded polyline points', () => {
    const points: [number, number][] = [];
    for (let i = 0; i < 100; i++) {
      points.push([40 + i * 0.001, -120 + i * 0.001]);
    }

    const gpx = generateGpx({
      name: 'many points',
      description: JSON.stringify({ test: true }),
      points,
      timestamps: points.map((_, i) => i),
    });

    const trkptCount = (gpx.match(/<trkpt /g) || []).length;
    expect(trkptCount).toBe(100);
  });
});
