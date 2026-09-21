// Minimal RFC 6455 WebSocket codec: frame encode, incremental frame decode and the
// opening-handshake accept key. Pure Uint8Array code with no runtime dependencies, so the
// Electron main process, unit tests and the demo server all share one implementation.
// Only the server side is exercised today; the phone itself uses the browser's WebSocket.

export const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export const OP_CONT = 0x0;
export const OP_TEXT = 0x1;
export const OP_BINARY = 0x2;
export const OP_CLOSE = 0x8;
export const OP_PING = 0x9;
export const OP_PONG = 0xa;

export type WsFrame = { opcode: number; payload: Uint8Array; final: boolean };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function computeAcceptKey(clientKey: string): Promise<string> {
  const data = textEncoder.encode(clientKey + WS_GUID);
  return crypto.subtle.digest("SHA-1", data).then(digest => bytesToBase64(new Uint8Array(digest)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Mask a payload in place with the 4-byte key, as clients must per the RFC (servers never mask) */
export function applyMask(payload: Uint8Array, mask: Uint8Array): void {
  for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
}

export function encodeFrame(
  opcode: number,
  payload: Uint8Array = new Uint8Array(0),
  options: { mask?: boolean; fin?: boolean } = {}
): Uint8Array {
  const maskBit = options.mask ? 0x80 : 0;
  const finBit = options.fin === false ? 0 : 0x80;
  const header: number[] = [finBit | (opcode & 0x0f)];
  const length = payload.length;
  if (length < 126) {
    header.push(maskBit | length);
  } else if (length < 65536) {
    header.push(maskBit | 126, (length >> 8) & 0xff, length & 0xff);
  } else {
    const high = Math.floor(length / 2 ** 32);
    const low = length >>> 0;
    header.push(
      maskBit | 127,
      (high >>> 24) & 0xff,
      (high >>> 16) & 0xff,
      (high >>> 8) & 0xff,
      high & 0xff,
      (low >>> 24) & 0xff,
      (low >>> 16) & 0xff,
      (low >>> 8) & 0xff,
      low & 0xff
    );
  }

  let mask: Uint8Array<ArrayBuffer> | null = null;
  if (options.mask) {
    mask = new Uint8Array(new ArrayBuffer(4));
    crypto.getRandomValues(mask);
    header.push(mask[0], mask[1], mask[2], mask[3]);
  }

  const body = payload.slice();
  if (mask) applyMask(body, mask);
  const frame = new Uint8Array(header.length + body.length);
  frame.set(header);
  frame.set(body, header.length);
  return frame;
}

export function encodeText(text: string, options?: { mask?: boolean }): Uint8Array {
  return encodeFrame(OP_TEXT, textEncoder.encode(text), options);
}

export function encodeClose(code = 1000, reason = ""): Uint8Array {
  const reasonBytes = textEncoder.encode(reason);
  const payload = new Uint8Array(2 + reasonBytes.length);
  payload[0] = (code >> 8) & 0xff;
  payload[1] = code & 0xff;
  payload.set(reasonBytes, 2);
  return encodeFrame(OP_CLOSE, payload);
}

/** Assemble frames out of whatever socket bytes arrive, in any chunking */
export class FrameParser {
  private buffer = new Uint8Array(0);

  /** Feed raw bytes, get every frame that became complete with this chunk */
  push(chunk: Uint8Array): WsFrame[] {
    if (this.buffer.length) {
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    } else {
      this.buffer = chunk.slice();
    }

    const frames: WsFrame[] = [];
    for (;;) {
      const frame = this.tryParseFrame();
      if (!frame) break;
      frames.push(frame);
      if (frame.opcode === OP_CLOSE) {
        this.buffer = new Uint8Array(0);
        break;
      }
    }
    return frames;
  }

  private tryParseFrame(): WsFrame | null {
    const buffer = this.buffer;
    if (buffer.length < 2) return null;

    const final = (buffer[0] & 0x80) !== 0;
    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let length = buffer[1] & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (buffer.length < offset + 2) return null;
      length = (buffer[offset] << 8) | buffer[offset + 1];
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) return null;
      let value = 0;
      for (let i = 0; i < 8; i++) value = value * 256 + buffer[offset + i];
      if (value > Number.MAX_SAFE_INTEGER) throw new Error("WebSocket frame too large");
      length = value;
      offset += 8;
    }

    let mask: Uint8Array<ArrayBuffer> | null = null;
    if (masked) {
      if (buffer.length < offset + 4) return null;
      mask = buffer.slice(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length < offset + length) return null;

    const payload = buffer.slice(offset, offset + length);
    if (mask) applyMask(payload, mask);
    this.buffer = buffer.slice(offset + length);
    return { opcode, payload, final };
  }
}

export const decodeText = (bytes: Uint8Array): string => textDecoder.decode(bytes);
