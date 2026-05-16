export function encodeKey(key: string): string {
  let encoded = encodeURIComponent(key);
  encoded = encoded.replace(/\./g, '%2E');
  return encoded;
}

export function decodeKey(encoded: string): string {
  return decodeURIComponent(encoded);
}
