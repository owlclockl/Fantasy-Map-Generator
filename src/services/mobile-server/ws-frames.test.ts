import { describe, expect, it } from "vitest";
import {
  computeAcceptKey,
  decodeText,
  encodeClose,
  encodeFrame,
  encodeText,
  FrameParser,
  OP_CLOSE,
  OP_PING,
  OP_TEXT
} from "./ws-frames";

describe("computeAcceptKey", () => {
  it("matches the RFC 6455 test vector", async () => {
    expect(await computeAcceptKey("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });
});

describe("frame encoding", () => {
  it("encodes short text frames without masking", () => {
    const frame = encodeText("hi");
    expect([...frame.slice(0, 2)]).toEqual([0x81, 0x02]);
    expect(decodeText(frame.slice(2))).toBe("hi");
  });

  it("uses the 16-bit length form for medium payloads", () => {
    const payload = new Uint8Array(300).fill(7);
    const frame = encodeFrame(OP_TEXT, payload);
    expect(frame[1] & 0x7f).toBe(126);
    expect((frame[2] << 8) | frame[3]).toBe(300);
  });

  it("uses the 64-bit length form for large payloads", () => {
    const payload = new Uint8Array(70_000);
    const frame = encodeFrame(OP_TEXT, payload);
    expect(frame[1] & 0x7f).toBe(127);
    expect(frame[2]).toBe(0);
    expect([frame[7], frame[8], frame[9]]).toEqual([0x01, 0x11, 0x70]); // 70000 = 0x0000011170
  });
});

describe("FrameParser", () => {
  const parse = (...chunks: Uint8Array[]): ReturnType<FrameParser["push"]> => {
    const parser = new FrameParser();
    return chunks.flatMap(chunk => parser.push(chunk));
  };

  it("parses a frame delivered in awkward chunks", () => {
    const frame = encodeText("hello websocket world");
    const frames = parse(frame.slice(0, 3), frame.slice(3, 9), frame.slice(9));
    expect(frames).toHaveLength(1);
    expect(frames[0].opcode).toBe(OP_TEXT);
    expect(frames[0].final).toBe(true);
    expect(decodeText(frames[0].payload)).toBe("hello websocket world");
  });

  it("parses masked frames like a real browser sends them", () => {
    const frame = encodeText("masked payload", { mask: true });
    expect(frame[1] & 0x80).not.toBe(0); // mask bit set
    const [parsed] = parse(frame);
    expect(decodeText(parsed.payload)).toBe("masked payload");
  });

  it("handles fragmented messages", () => {
    const parser = new FrameParser();
    const first = encodeFrame(0x01, new TextEncoder().encode("frag-one "), { fin: false });
    const cont = encodeFrame(0x00, new TextEncoder().encode("frag-two"));
    const frames = [...parser.push(first), ...parser.push(cont)];
    expect(frames).toHaveLength(2);
    expect(frames[0].final).toBe(false);
    expect(frames[1].opcode).toBe(0x00);
    expect(frames[1].final).toBe(true);
    expect(decodeText(frames[0].payload) + decodeText(frames[1].payload)).toBe("frag-one frag-two");
  });

  it("parses ping and close frames", () => {
    const ping = encodeFrame(OP_PING, new TextEncoder().encode("ka"));
    const close = encodeClose(1000, "bye");
    const frames = parse(ping, close);
    expect(frames.map(frame => frame.opcode)).toEqual([OP_PING, OP_CLOSE]);
    expect((frames[1].payload[0] << 8) | frames[1].payload[1]).toBe(1000);
    expect(decodeText(frames[1].payload.slice(2))).toBe("bye");
  });

  it("keeps partial frames buffered", () => {
    const parser = new FrameParser();
    const frame = encodeText("wait for it");
    expect(parser.push(frame.slice(0, 5))).toHaveLength(0);
    expect(parser.push(new Uint8Array(0))).toHaveLength(0);
    expect(parser.push(frame.slice(5))).toHaveLength(1);
  });
});
