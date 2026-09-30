/**
 * Reassembles SeedLink 3.1 data packets from an arbitrarily chunked byte stream.
 *
 * A SeedLink data packet is an 8-byte header ("SL" + a 6 hex digit sequence
 * number) followed by one miniSEED 2 record: 512 bytes in SeedLink 3, or the
 * length given by blockette 1000 when the record has one.
 *
 * A WebSocket bridge that forwards raw TCP reads does not keep packet
 * boundaries: one message can hold command replies ("OK\r\nOK\r\n",
 * "ERROR\r\n"), a packet plus the first bytes of the next one, the tail of a
 * split packet, or several packets. Feed every message to `push()`. It keeps
 * partial data between calls, drops text replies, INFO packets and any other
 * bytes that do not start a packet (resyncing on the next valid packet
 * header), and returns only complete data packets. It never throws.
 */

const SL_HEADER_LEN = 8;
const MSEED_FIXED_HEADER_LEN = 48;
/** Bytes needed to recognise a packet: SL header + miniSEED header up to the start-time seconds. */
const HEADER_CHECK_LEN = SL_HEADER_LEN + 27;
/** SeedLink 3 record length, used when a record has no blockette 1000. */
const DEFAULT_RECORD_LEN = 512;
const MIN_RECORD_EXP = 7; // 128 bytes
const MAX_RECORD_EXP = 16; // 64 KiB
const DEFAULT_MAX_BUFFER_BYTES = 256 * 1024;
const INITIAL_CAPACITY = 4096;
const MAX_LINE_LEN = 256;

const NOT_PACKET = 0;
const NEED_MORE = -1;

const CHAR_S = 0x53;
const CHAR_I = 0x49;
const INFO_HEADER = "SLINFO  "; // the last byte is "*" when more INFO packets follow

export interface SeedlinkFramerResult {
    /** Complete SeedLink data packets ("SL" header + miniSEED record), in stream order. */
    packets: ArrayBuffer[];
    /** Text lines received between packets, such as "OK" or "ERROR". */
    replies: string[];
    /** Bytes discarded because they were not part of a data packet. */
    dropped: number;
}

export interface SeedlinkFramerOptions {
    /** Most bytes kept between calls; if a partial packet grows past it, it is dropped. */
    maxBufferBytes?: number;
}

export class SeedlinkFramer {
    private buf = new Uint8Array(INITIAL_CAPACITY);
    private len = 0;
    /** How far into the pending packet (relative to its start) we have looked for an embedded header. */
    private checked = 0;
    private line = "";
    private lineClean = true;
    private readonly maxBufferBytes: number;

    constructor(options: SeedlinkFramerOptions = {}) {
        this.maxBufferBytes = Math.max(
            options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
            HEADER_CHECK_LEN,
        );
    }

    /** Bytes currently held while waiting for the rest of a packet. */
    get pendingBytes(): number {
        return this.len;
    }

    /** Forget buffered data, e.g. before requesting a different stream. */
    reset(): void {
        this.len = 0;
        this.checked = 0;
        this.line = "";
        this.lineClean = true;
    }

    push(chunk: ArrayBuffer | ArrayBufferView | string): SeedlinkFramerResult {
        const out: SeedlinkFramerResult = { packets: [], replies: [], dropped: 0 };
        const bytes = toBytes(chunk);
        if (bytes.length === 0) return out;
        this.append(bytes);

        const buf = this.buf;
        let pos = 0;
        while (pos < this.len) {
            if (buf[pos] === CHAR_S) {
                const size = this.packetSize(pos);
                if (size === NEED_MORE) break;
                if (size !== NOT_PACKET) {
                    const end = pos + size;
                    // A valid header inside this packet means it was cut short (for
                    // example the upstream stream restarted): drop it and resync there.
                    const embedded = this.findHeader(
                        pos + Math.max(this.checked, 1),
                        Math.min(end, this.len),
                    );
                    if (embedded >= 0) {
                        out.dropped += embedded - pos;
                        pos = embedded;
                        this.checked = 0;
                        continue;
                    }
                    if (end > this.len) {
                        this.checked = Math.max(1, this.len - pos - HEADER_CHECK_LEN + 1);
                        break;
                    }
                    if (buf[pos + 2] === CHAR_I) {
                        out.dropped += size; // INFO packet, not waveform data
                    } else {
                        out.packets.push(buf.slice(pos, end).buffer);
                    }
                    pos = end;
                    this.checked = 0;
                    this.line = "";
                    this.lineClean = true;
                    continue;
                }
            }
            this.consumeText(buf[pos], out);
            out.dropped++;
            pos++;
            this.checked = 0;
        }

        if (pos > 0) {
            buf.copyWithin(0, pos, this.len);
            this.len -= pos;
        }
        if (this.len > this.maxBufferBytes) {
            out.dropped += this.len;
            this.len = 0;
            this.checked = 0;
        }
        if (this.buf.length > Math.max(this.maxBufferBytes, INITIAL_CAPACITY)) {
            // Release the space taken by an unusually large message.
            this.buf = this.buf.slice(0, Math.max(INITIAL_CAPACITY, this.len));
        }
        return out;
    }

    private append(bytes: Uint8Array): void {
        const needed = this.len + bytes.length;
        if (needed > this.buf.length) {
            const grown = new Uint8Array(Math.max(needed, this.buf.length * 2));
            grown.set(this.buf.subarray(0, this.len));
            this.buf = grown;
        }
        this.buf.set(bytes, this.len);
        this.len = needed;
    }

    /** Size of the packet starting at `p`, NOT_PACKET if none starts there, NEED_MORE if undecided. */
    private packetSize(p: number): number {
        const header = this.checkHeader(p);
        if (header !== 1) return header;

        const rec = p + SL_HEADER_LEN;
        const avail = this.len - rec;
        if (avail < MSEED_FIXED_HEADER_LEN) return NEED_MORE;

        const dv = new DataView(this.buf.buffer, this.buf.byteOffset + rec, avail);
        // Same byte order test as libmseed: a big-endian start year must be plausible.
        const year = dv.getUint16(20, false);
        const le = year < 1900 || year > 2100;
        let offset = dv.getUint16(46, le);
        for (let n = dv.getUint8(39); n > 0 && offset !== 0; n--) {
            if (offset < MSEED_FIXED_HEADER_LEN || offset + 8 > DEFAULT_RECORD_LEN) break;
            if (offset + 8 > avail) return NEED_MORE;
            if (dv.getUint16(offset, le) === 1000) {
                const exp = dv.getUint8(offset + 6);
                if (exp < MIN_RECORD_EXP || exp > MAX_RECORD_EXP) return NOT_PACKET;
                return SL_HEADER_LEN + (1 << exp);
            }
            const next = dv.getUint16(offset + 2, le);
            if (next <= offset) break;
            offset = next;
        }
        return SL_HEADER_LEN + DEFAULT_RECORD_LEN;
    }

    /**
     * 1 if a packet header starts at `p`, NOT_PACKET if not, NEED_MORE if the
     * buffer ends first. Checks the SL header plus the same miniSEED 2 fixed
     * header fields libmseed uses to detect a record.
     */
    private checkHeader(p: number): number {
        const b = this.buf;
        const n = Math.min(this.len - p, HEADER_CHECK_LEN);
        const info = n > 2 && b[p + 2] === CHAR_I;
        for (let i = 0; i < n; i++) {
            const c = b[p + i];
            let ok: boolean;
            if (i < 2 || (info && i < 7)) ok = c === INFO_HEADER.charCodeAt(i);
            else if (i === 7 && info) ok = c === 0x20 || c === 0x2a;
            else if (i < SL_HEADER_LEN) ok = isHex(c);
            else ok = recordHeaderByteOk(i - SL_HEADER_LEN, c);
            if (!ok) return NOT_PACKET;
        }
        return n === HEADER_CHECK_LEN ? 1 : NEED_MORE;
    }

    /** First position in [from, to) where a complete, valid packet header can be seen, or -1. */
    private findHeader(from: number, to: number): number {
        const view = this.buf.subarray(0, to);
        for (let p = view.indexOf(CHAR_S, from); p !== -1; p = view.indexOf(CHAR_S, p + 1)) {
            if (p + HEADER_CHECK_LEN <= this.len && this.checkHeader(p) === 1) return p;
        }
        return -1;
    }

    private consumeText(c: number, out: SeedlinkFramerResult): void {
        if (c === 0x0d || c === 0x0a) {
            const line = this.line.trim();
            if (line && this.lineClean) out.replies.push(line);
            this.line = "";
            this.lineClean = true;
        } else if (c >= 0x20 && c < 0x7f && this.line.length < MAX_LINE_LEN) {
            this.line += String.fromCharCode(c);
        } else {
            // Binary data or an overlong line: not a server reply.
            this.line = "";
            this.lineClean = false;
        }
    }
}

function isHex(c: number): boolean {
    return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

/** Checks one byte of the miniSEED 2 fixed header (offset `i` within the record). */
function recordHeaderByteOk(i: number, c: number): boolean {
    if (i < 6) return (c >= 0x30 && c <= 0x39) || c === 0x20 || c === 0; // sequence number
    if (i === 6) return c === 0x44 || c === 0x52 || c === 0x51 || c === 0x4d; // D, R, Q, M
    if (i === 7) return c === 0x20 || c === 0;
    if (i === 24) return c <= 23; // hour
    if (i === 25) return c <= 59; // minute
    if (i === 26) return c <= 60; // second
    return true;
}

function toBytes(chunk: unknown): Uint8Array {
    if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
    if (ArrayBuffer.isView(chunk)) {
        return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }
    if (typeof chunk === "string") return new TextEncoder().encode(chunk);
    return new Uint8Array(0);
}
