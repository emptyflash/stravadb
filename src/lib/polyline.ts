import polyline from '@mapbox/polyline';

export function encode(points: [number, number][]): string {
  return polyline.encode(points.map(([lat, lng]) => [lat, lng]));
}

export function decode(str: string): [number, number][] {
  return polyline.decode(str).map(([lat, lng]) => [lat as number, lng as number]);
}
