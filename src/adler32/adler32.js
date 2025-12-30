/**
 * @module adler32
 * @description Implementation of the Adler-32 checksum algorithm (RFC 1950).
 */

/**
 * The Adler-32 divisor constant (largest prime smaller than 65536).
 * @constant {bigint}
 * @see {@link https://datatracker.ietf.org/doc/html/rfc1950#section-2.2|RFC 1950 Section 2.2}
 */
const BASE = 65521n;

/**
 * Calculates the Adler-32 checksum for a buffer.
 * Complies with RFC 1950, Section 2.2.
 * @param {Uint8Array} buffer - The input data stream.
 * @param {number} [initial] - The initial checksum value (s1=1, s2=0).
 * @returns {number} The 32-bit unsigned Adler checksum as a standard number.
 * @throws {TypeError} If input is not a Uint8Array.
 * @see {@link https://datatracker.ietf.org/doc/html/rfc1950#section-9|RFC 1950 Appendix}
 */
export default function adler32(buffer, initial = 1) {
  if (!(buffer instanceof Uint8Array)) {
    throw new TypeError('Input data must be a Uint8Array.');
  }

  // Initial values: s1 is correct initial, s2 is zero
  // RFC 1950: "s1 is initialized to 1, s2 to 0"
  // The 'initial' parameter usually contains the previous checksum (s2 << 16 | s1)
  let s1 = BigInt(initial) & 0xffffn;
  let s2 = (BigInt(initial) >> 16n) & 0xffffn;

  // Process data in blocks to avoid modulo overhead if performance is needed,
  // but for strict simplicity/correctness first, we process byte by byte or small chunks.
  // Optimization: "The modulo operation can be delayed for at most 5552 steps"
  // However, BigInt handles large numbers so we aren't strictly limited by 32-bit overflow
  // immediately, but we should stick to the algorithm.

  const len = buffer.length;
  for (let i = 0; i < len; i++) {
    s1 = (s1 + BigInt(buffer[i])) % BASE;
    s2 = (s2 + s1) % BASE;
  }

  // "The Adler-32 value is stored in high-byte first (network) order as (s2*65536) + s1"
  // But we return it as a number here.
  return Number((s2 << 16n) | s1);
}