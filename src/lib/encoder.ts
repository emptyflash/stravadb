const SEED_LAT = 40.0;
const SEED_LNG = -120.0;
const FORWARD_STEP = 0.00001;
const DATA_RANGE = 0.003;
const PRECISION = 1e5;

export const BYTES_PER_POINT = 2;

function baseline(index: number): [number, number] {
  const lat = SEED_LAT + index * FORWARD_STEP;
  const lng = SEED_LNG + index * FORWARD_STEP;
  return [
    Math.round(lat * PRECISION) / PRECISION,
    Math.round(lng * PRECISION) / PRECISION,
  ];
}

export function encodePair(b0: number, b1: number, pointIndex: number): [number, number] {
  const [baseLat, baseLng] = baseline(pointIndex);
  const latOff = ((b0 / 255) - 0.5) * DATA_RANGE;
  const lngOff = ((b1 / 255) - 0.5) * DATA_RANGE;
  return [
    Math.round((baseLat + latOff) * PRECISION) / PRECISION,
    Math.round((baseLng + lngOff) * PRECISION) / PRECISION,
  ];
}

export function decodePair(lat: number, lng: number, pointIndex: number, out: Uint8Array, offset: number): void {
  const [baseLat, baseLng] = baseline(pointIndex);
  const latOff = lat - baseLat;
  const lngOff = lng - baseLng;
  out[offset] = clampByte(Math.round((latOff / DATA_RANGE + 0.5) * 255));
  out[offset + 1] = clampByte(Math.round((lngOff / DATA_RANGE + 0.5) * 255));
}

export function encodeBuffer(data: Uint8Array): [number, number][] {
  const paddedLen = Math.ceil(data.length / BYTES_PER_POINT) * BYTES_PER_POINT;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  const points: [number, number][] = [];
  for (let i = 0; i < paddedLen; i += BYTES_PER_POINT) {
    points.push(encodePair(padded[i]!, padded[i + 1] ?? 0, i / BYTES_PER_POINT));
  }
  return points;
}

export function decodePoints(points: [number, number][], originalLength: number): Uint8Array {
  const buf = new Uint8Array(points.length * BYTES_PER_POINT);
  for (let i = 0; i < points.length; i++) {
    decodePair(points[i]![0], points[i]![1], i, buf, i * BYTES_PER_POINT);
  }
  return buf.subarray(0, originalLength);
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v));
}
