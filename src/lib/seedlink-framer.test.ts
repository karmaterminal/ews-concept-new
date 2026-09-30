import { beforeAll, describe, expect, it } from "vitest";
import { SeedlinkFramer } from "./seedlink-framer";
import { WaveformService } from "./services/WaveformService";

interface PacketOptions {
    /** Blockette 1000 record length exponent, or null for a record without blockette 1000 (512 bytes). */
    exp?: number | null;
    littleEndian?: boolean;
    /** Put a blockette 100 in front of blockette 1000. */
    withB100?: boolean;
}

/** One SeedLink 3 packet: "SL" + hex sequence number + a miniSEED 2 record of int32 samples. */
function makePacket(seq: number, opts: PacketOptions = {}): Uint8Array {
    const exp = opts.exp === undefined ? 9 : opts.exp;
    const le = opts.littleEndian ?? false;
    const recLen = exp === null ? 512 : 1 << exp;
    const out = new Uint8Array(8 + recLen);
    const dv = new DataView(out.buffer, 8);
    const ascii = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
    };

    ascii(0, "SL" + seq.toString(16).toUpperCase().padStart(6, "0"));
    ascii(8, String(seq).padStart(6, "0") + "D CANT   LHZXX");
    dv.setUint16(20, 2026, le); // year
    dv.setUint16(22, 270, le); // day of year
    dv.setUint8(24, 12); // hour
    dv.setUint8(25, Math.floor(seq / 60) % 60); // minute
    dv.setUint8(26, seq % 60); // second
    dv.setInt16(32, 1, le); // sample rate factor
    dv.setInt16(34, 1, le); // sample rate multiplier

    const dataOffset = opts.withB100 ? 128 : 64;
    let offset = 48;
    let count = 0;
    if (opts.withB100) {
        dv.setUint16(offset, 100, le);
        dv.setUint16(offset + 2, exp === null ? 0 : offset + 12, le);
        dv.setFloat32(offset + 4, 1, le);
        offset += 12;
        count++;
    }
    if (exp !== null) {
        dv.setUint16(offset, 1000, le);
        dv.setUint16(offset + 2, 0, le);
        dv.setUint8(offset + 4, 3); // int32 encoding
        dv.setUint8(offset + 5, le ? 0 : 1);
        dv.setUint8(offset + 6, exp);
        count++;
    }
    dv.setUint8(39, count);
    dv.setUint16(44, dataOffset, le);
    dv.setUint16(46, count > 0 ? 48 : 0, le);

    const numSamples = (recLen - dataOffset) / 4;
    dv.setInt16(30, numSamples, le);
    for (let i = 0; i < numSamples; i++) {
        dv.setInt32(dataOffset + i * 4, Math.round(1000 * Math.sin((seq * numSamples + i) / 5)), le);
    }
    return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

const text = (s: string) => new TextEncoder().encode(s);
const bytesOf = (packets: ArrayBuffer[]) => packets.map((p) => Array.from(new Uint8Array(p)));
const asArray = (u8: Uint8Array) => Array.from(u8);

/** Deterministic PRNG so the chunking tests are reproducible. */
function mulberry32(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let miniseed: { parseDataRecords: (b: ArrayBufferLike) => any[] };

beforeAll(async () => {
    // seisplotjs registers custom elements on import; stub the two globals it touches.
    const g = globalThis as any;
    g.HTMLElement ??= class {};
    g.customElements ??= { define() {}, get() {} };
    miniseed = (await import("seisplotjs")).miniseed;
});

describe("SeedlinkFramer", () => {
    const p1 = makePacket(1);
    const p2 = makePacket(2);
    const p3 = makePacket(3);

    it("passes a clean 520-byte packet through unchanged", () => {
        const framer = new SeedlinkFramer();
        const { packets, replies, dropped } = framer.push(p1.slice().buffer);
        expect(p1.length).toBe(520);
        expect(bytesOf(packets)).toEqual([asArray(p1)]);
        expect(replies).toEqual([]);
        expect(dropped).toBe(0);
        expect(framer.pendingBytes).toBe(0);
    });

    it("holds the 6 extra bytes of a 526-byte message until the 514-byte tail arrives", () => {
        const framer = new SeedlinkFramer();
        const first = framer.push(concat(p1, p2.subarray(0, 6)));
        expect(bytesOf(first.packets)).toEqual([asArray(p1)]);
        expect(framer.pendingBytes).toBe(6);

        const second = framer.push(p2.subarray(6));
        expect(p2.subarray(6).length).toBe(514);
        expect(bytesOf(second.packets)).toEqual([asArray(p2)]);
        expect(framer.pendingBytes).toBe(0);
    });

    it("splits two coalesced packets (1040 bytes)", () => {
        const { packets } = new SeedlinkFramer().push(concat(p1, p2));
        expect(bytesOf(packets)).toEqual([asArray(p1), asArray(p2)]);
    });

    it("turns coalesced command replies into reply lines, not packets", () => {
        const framer = new SeedlinkFramer();
        const ok = framer.push(text("OK\r\nOK\r\nOK\r\n"));
        expect(ok).toEqual({ packets: [], replies: ["OK", "OK", "OK"], dropped: 12 });
        const err = framer.push(text("ERROR\r\nERROR\r\n"));
        expect(err).toEqual({ packets: [], replies: ["ERROR", "ERROR"], dropped: 14 });
        expect(framer.pendingBytes).toBe(0);
    });

    it("accepts text frames", () => {
        expect(new SeedlinkFramer().push("OK\r\n").replies).toEqual(["OK"]);
    });

    it("needs a miniSEED header after 'SL' + hex digits to start a packet", () => {
        const framer = new SeedlinkFramer();
        const line = "SLABCDEF is text, not a data packet";
        expect(framer.push(line + "\r\n").replies).toEqual([line]);
        expect(framer.pendingBytes).toBe(0);
    });

    it("keeps a reply line that is split across messages", () => {
        const framer = new SeedlinkFramer();
        expect(framer.push(text("ER")).replies).toEqual([]);
        expect(framer.push(text("ROR\r\n")).replies).toEqual(["ERROR"]);
    });

    it("drops a 514-byte tail when the stream is joined mid-packet, then resyncs", () => {
        const framer = new SeedlinkFramer();
        const tail = framer.push(p1.subarray(6));
        expect(tail.packets).toEqual([]);
        expect(tail.dropped + framer.pendingBytes).toBe(514);
        const next = framer.push(p2);
        expect(bytesOf(next.packets)).toEqual([asArray(p2)]);
    });

    it("finds packets around replies and garbage in one message", () => {
        const noise = new Uint8Array([0x00, 0xff, 0x53, 0x4c, 0x5a, 0x10, 0x53]); // includes a false "SL" start
        const { packets, replies } = new SeedlinkFramer().push(
            concat(text("OK\r\n"), p1, noise, text("\r\nOK\r\n"), p2, text("END"), p3),
        );
        expect(bytesOf(packets)).toEqual([asArray(p1), asArray(p2), asArray(p3)]);
        // The noise ends with an unterminated fragment, so only the two clean "OK" lines count.
        expect(replies).toEqual(["OK", "OK"]);
    });

    it("takes the record length from blockette 1000, in either byte order", () => {
        const cases = [
            makePacket(10, { exp: 12 }),
            makePacket(11, { exp: 8, littleEndian: true }),
            makePacket(12, { withB100: true }),
            makePacket(13, { withB100: true, littleEndian: true, exp: 12 }),
            makePacket(14, { exp: null }), // no blockette 1000: SeedLink 3 default of 512
        ];
        expect(cases.map((p) => p.length)).toEqual([4104, 264, 520, 4104, 520]);
        const framer = new SeedlinkFramer();
        const packets = cases.flatMap((p) => framer.push(p).packets);
        expect(bytesOf(packets)).toEqual(cases.map(asArray));
        expect(framer.pendingBytes).toBe(0);
    });

    it("skips SLINFO packets", () => {
        const info = makePacket(0);
        info.set(text("SLINFO *"), 0);
        const { packets, dropped } = new SeedlinkFramer().push(concat(info, p1));
        expect(bytesOf(packets)).toEqual([asArray(p1)]);
        expect(dropped).toBe(520);
    });

    it("drops a packet cut short by a new stream and keeps the new one", () => {
        const framer = new SeedlinkFramer();
        expect(framer.push(p1.subarray(0, 300)).packets).toEqual([]);
        const { packets } = framer.push(concat(text("OK\r\nOK\r\n"), p2));
        expect(bytesOf(packets)).toEqual([asArray(p2)]);
        expect(framer.pendingBytes).toBe(0);
    });

    it("reset() discards a partial packet", () => {
        const framer = new SeedlinkFramer();
        framer.push(p1.subarray(0, 100));
        expect(framer.pendingBytes).toBe(100);
        framer.reset();
        expect(framer.pendingBytes).toBe(0);
        expect(bytesOf(framer.push(p2).packets)).toEqual([asArray(p2)]);
    });

    it("never throws and never holds more than maxBufferBytes", () => {
        const framer = new SeedlinkFramer({ maxBufferBytes: 256 });
        const rand = mulberry32(7);
        const junk = Uint8Array.from({ length: 5000 }, () => Math.floor(rand() * 256));
        for (const input of [null, undefined, 42, {}, new ArrayBuffer(0), "", junk, p1.subarray(0, 300)]) {
            expect(() => framer.push(input as any)).not.toThrow();
            expect(framer.pendingBytes).toBeLessThanOrEqual(256);
        }
    });

    it("reassembles every packet whatever the message boundaries", () => {
        const packets = Array.from({ length: 40 }, (_, i) =>
            makePacket(100 + i, { exp: i % 7 === 0 ? 12 : 9, littleEndian: i % 3 === 0 }),
        );
        const stream = concat(text("OK\r\nOK\r\nOK\r\nOK\r\n"), ...packets);

        for (const seed of [1, 2, 3, 4, 5]) {
            const rand = mulberry32(seed);
            const framer = new SeedlinkFramer();
            const got: ArrayBuffer[] = [];
            let replies = 0;
            let dropped = 0;
            for (let at = 0; at < stream.length; ) {
                // Mostly small chunks, sometimes single bytes, sometimes several packets.
                const r = rand();
                const size = r < 0.2 ? 1 : r < 0.9 ? 1 + Math.floor(rand() * 600) : 1 + Math.floor(rand() * 3000);
                const res = framer.push(stream.slice(at, at + size));
                got.push(...res.packets);
                replies += res.replies.length;
                dropped += res.dropped;
                at += size;
            }
            expect(bytesOf(got)).toEqual(packets.map(asArray));
            expect(replies).toBe(4);
            expect(dropped).toBe(16);
            expect(framer.pendingBytes).toBe(0);
        }
    });

    it("emits packets that seisplotjs parses as exactly one record", () => {
        const framer = new SeedlinkFramer();
        const messages = [
            text("OK\r\nOK\r\nOK\r\n"),
            concat(p1, p2.subarray(0, 6)),
            p2.subarray(6),
            concat(makePacket(4), makePacket(5, { littleEndian: true })),
            makePacket(6, { exp: 12 }),
        ];
        const packets = messages.flatMap((m) => framer.push(m).packets);
        expect(packets).toHaveLength(5);
        for (const packet of packets) {
            const records = miniseed.parseDataRecords(packet.slice(8));
            expect(records).toHaveLength(1);
            expect(records[0].header.staCode).toBe("CANT");
            expect(records[0].decompress()).toHaveLength(records[0].header.numSamples);
        }
    });
});

describe("WaveformService.processMiniseed with SeedLink bridge messages", () => {
    const p1 = makePacket(1);
    const p2 = makePacket(2);
    const samplesPerPacket = (512 - 64) / 4;

    it("fails when a raw message is treated as one packet", async () => {
        const service = new WaveformService();
        await service.init();
        const message = concat(p1, p2.subarray(0, 6));
        expect(() => service.processMiniseed(message.slice().buffer)).toThrow(
            "Not enought bytes for header, need 47, found 6",
        );
    });

    it("parses every packet once the messages go through the framer", async () => {
        const service = new WaveformService();
        await service.init();
        const framer = new SeedlinkFramer();
        const messages = [
            text("OK\r\nOK\r\nOK\r\n"),
            text("ERROR\r\nERROR\r\n"),
            concat(p1, p2.subarray(0, 6)),
            p2.subarray(6),
            concat(makePacket(3), makePacket(4)),
            makePacket(5),
        ];
        for (const message of messages) {
            for (const packet of framer.push(message).packets) {
                service.processMiniseed(packet);
            }
        }
        expect(service.getBuffer()).toHaveLength(5 * samplesPerPacket);
    });
});
