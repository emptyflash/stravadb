import { encodeBuffer, decodePoints, BYTES_PER_POINT } from './encoder.js';

export const HEADER_SIZE = 8;
export const MAX_CHUNK_PAYLOAD = 2000;

export interface ChunkHeader {
  totalChunks: number;
  payloadLength: number;
}

export function encodeHeader(header: ChunkHeader): Uint8Array {
  const buf = new Uint8Array(HEADER_SIZE);
  buf[0] = 0x53;
  buf[1] = 0x44;
  buf[2] = 0x42;
  buf[3] = 0x01;
  buf[4] = 0x00;
  buf[5] = header.totalChunks;
  buf[6] = (header.payloadLength >> 8) & 0xff;
  buf[7] = header.payloadLength & 0xff;
  return buf;
}

export function decodeHeader(buf: Uint8Array): ChunkHeader | null {
  if (buf.length < HEADER_SIZE) return null;
  if (buf[0] !== 0x53 || buf[1] !== 0x44 || buf[2] !== 0x42) return null;
  if (buf[3] !== 0x01) return null;
  return {
    totalChunks: buf[5]!,
    payloadLength: (buf[6]! << 8) | buf[7]!,
  };
}

export interface EncodedChunk {
  header: ChunkHeader;
  points: [number, number][];
}

export function chunkData(data: Uint8Array): EncodedChunk[] {
  const totalChunks = Math.max(1, Math.ceil(data.length / MAX_CHUNK_PAYLOAD));
  const chunks: EncodedChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * MAX_CHUNK_PAYLOAD;
    const end = Math.min(start + MAX_CHUNK_PAYLOAD, data.length);
    const chunkBytes = data.subarray(start, end);
    const header = encodeHeader({ totalChunks, payloadLength: chunkBytes.length });
    const combined = new Uint8Array(HEADER_SIZE + chunkBytes.length);
    combined.set(header);
    combined.set(chunkBytes, HEADER_SIZE);
    const pointCount = Math.ceil(combined.length / BYTES_PER_POINT);
    chunks.push({
      header: { totalChunks, payloadLength: chunkBytes.length },
      points: encodeBuffer(combined),
    });
  }

  return chunks;
}

export function unchunkData(points: [number, number][]): Uint8Array | null {
  const buf = decodePoints(points, points.length * BYTES_PER_POINT);
  const header = decodeHeader(buf);
  if (!header) return null;
  return buf.subarray(HEADER_SIZE, HEADER_SIZE + header.payloadLength);
}

export function unchunkAll(chunks: [number, number][][], totalSize: number): Uint8Array {
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const points of chunks) {
    const data = unchunkData(points);
    if (data) {
      result.set(data, offset);
      offset += data.length;
    }
  }
  return result;
}
