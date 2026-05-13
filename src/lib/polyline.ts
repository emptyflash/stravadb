import polyline from '@mapbox/polyline';

export function encode(points: [number, number][]): string {
  return polyline.encode(points);
}

export function decode(str: string): [number, number][] {
  return polyline.decode(str);
}
