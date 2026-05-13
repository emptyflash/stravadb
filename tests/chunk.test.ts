import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  HEADER_SIZE,
  MAX_CHUNK_PAYLOAD,
  encodeHeader,
  decodeHeader,
  chunkData,
  unchunkData,
  unchunkAll,
} from '../src/lib/chunk.js';

describe('chunk', () => {
  describe('encodeHeader / decodeHeader', () => {
    it('encodes and decodes a header', () => {
      const header = { totalChunks: 3, payloadLength: 500 };
      const encoded = encodeHeader(header);
      expect(encoded.length).toBe(HEADER_SIZE);
      const decoded = decodeHeader(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.totalChunks).toBe(3);
      expect(decoded!.payloadLength).toBe(500);
    });

    it('returns null for invalid magic', () => {
      const buf = new Uint8Array(HEADER_SIZE);
      buf.fill(0xff);
      expect(decodeHeader(buf)).toBeNull();
    });

    it('returns null for wrong version', () => {
      const buf = new Uint8Array([0x53, 0x44, 0x42, 0x02, 0x00, 0x01, 0x00, 0x64]);
      expect(decodeHeader(buf)).toBeNull();
    });

    it('returns null for buffer shorter than header', () => {
      expect(decodeHeader(new Uint8Array(4))).toBeNull();
    });

    it('handles max uint16 payload length', () => {
      const header = { totalChunks: 1, payloadLength: 65535 };
      const encoded = encodeHeader(header);
      const decoded = decodeHeader(encoded);
      expect(decoded!.payloadLength).toBe(65535);
    });
  });

  describe('chunkData / unchunkData round-trip', () => {
    it('handles empty data', () => {
      const data = new Uint8Array(0);
      const chunks = chunkData(data);
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.header.totalChunks).toBe(1);
      expect(chunks[0]!.header.payloadLength).toBe(0);

      const decoded = unchunkData(chunks[0]!.points);
      expect(decoded).not.toBeNull();
      expect(decoded!.length).toBe(0);
    });

    it('handles small data (single chunk)', () => {
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const chunks = chunkData(data);
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.header.totalChunks).toBe(1);
      expect(chunks[0]!.header.payloadLength).toBe(5);

      const decoded = unchunkData(chunks[0]!.points);
      expect(decoded).not.toBeNull();
      expect([...decoded!]).toEqual([...data]);
    });

    it('handles data exactly at chunk boundary', () => {
      const data = new Uint8Array(new Array(MAX_CHUNK_PAYLOAD).fill(0x42));
      const chunks = chunkData(data);
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.header.totalChunks).toBe(1);

      const decoded = unchunkData(chunks[0]!.points);
      expect(decoded!.length).toBe(MAX_CHUNK_PAYLOAD);
      expect([...decoded!]).toEqual([...data]);
    });

    it('handles data exceeding one chunk', () => {
      const data = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD + 500));
      const chunks = chunkData(data);
      expect(chunks.length).toBe(2);
      expect(chunks[0]!.header.totalChunks).toBe(2);
      expect(chunks[1]!.header.totalChunks).toBe(2);
      expect(chunks[0]!.header.payloadLength).toBe(MAX_CHUNK_PAYLOAD);
      expect(chunks[1]!.header.payloadLength).toBe(500);
    });

    it('handles data spanning many chunks', () => {
      const data = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD * 3 + 123));
      const chunks = chunkData(data);
      expect(chunks.length).toBe(4);
    });
  });

  describe('unchunkAll', () => {
    it('reassembles chunked data', () => {
      const data = new Uint8Array(randomBytes(MAX_CHUNK_PAYLOAD * 2 + 300));
      const chunks = chunkData(data);
      const allPoints = chunks.map((c) => c.points);
      const result = unchunkAll(allPoints, data.length);
      expect([...result]).toEqual([...data]);
    });

    it('reassembles single chunk', () => {
      const data = new Uint8Array(randomBytes(100));
      const chunks = chunkData(data);
      const allPoints = chunks.map((c) => c.points);
      const result = unchunkAll(allPoints, data.length);
      expect([...result]).toEqual([...data]);
    });
  });
});
