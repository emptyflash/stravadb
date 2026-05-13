import { encode } from './polyline.js';

export interface GpxOptions {
  name: string;
  description: string;
  points: [number, number][];
  timestamps: number[];
}

export function generateGpx(opts: GpxOptions): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="stravadb" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
    `    <name>${escapeXml(opts.name)}</name>`,
    `    <desc>${escapeXml(opts.description)}</desc>`,
    '    <trkseg>',
  ];

  const baseTime = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < opts.points.length; i++) {
    const [lat, lng] = opts.points[i]!;
    const ts = opts.timestamps[i] ?? i;
    const time = new Date(baseTime.getTime() + ts * 1000).toISOString();
    lines.push(
      `      <trkpt lat="${lat}" lon="${lng}">`,
      '        <ele>0</ele>',
      `        <time>${time}</time>`,
      '      </trkpt>',
    );
  }

  lines.push('    </trkseg>', '  </trk>', '</gpx>');
  return lines.join('\n');
}

export function gpxSize(opts: Omit<GpxOptions, 'timestamps'>): number {
  const ts = new Array(opts.points.length).fill(0);
  return Buffer.byteLength(generateGpx({ ...opts, timestamps: ts }), 'utf-8');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
