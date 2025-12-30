/**
 * @module inflate/huffman
 * @description Huffman Token Decoder (RFC 1951).
 */

import InflateBitStream from './bitstream.js';

const MAX_BITS = 15;

/**
 * Huffman Decoder.
 */
export default class HuffmanDecoder {
  /**
   * @param {Uint8Array} lengths - Array of code lengths for each symbol.
   */
  constructor(lengths) {
    this.lengths = lengths;
    this.table = null; // Uint16Array or similar lookup
    this.maxLen = 0;
    this.build();
  }

  /**
   * Builds the lookup table.
   */
  build() {
    const { lengths } = this;
    const lenCounts = new Uint16Array(MAX_BITS + 1).fill(0);
    const nextCode = new Uint16Array(MAX_BITS + 1).fill(0);

    // Count lengths
    let maxLen = 0;
    for (let i = 0; i < lengths.length; i++) {
      const len = lengths[i];
      if (len > maxLen) maxLen = len;
      if (len > 0) lenCounts[len]++;
    }
    this.maxLen = maxLen;

    if (this.maxLen > MAX_BITS) {
      throw new Error('Huffman code length exceeds maximum');
    }

    // Assign codes (Canonical)
    let code = 0;
    for (let bits = 1; bits <= MAX_BITS; bits++) {
      code = (code + lenCounts[bits - 1]) << 1;
      nextCode[bits] = code;
    }

    // Build Table
    // We use a direct lookup table 2^maxLen.
    // For maxLen=15, size=32768.
    const tableSize = 1 << maxLen;
    this.table = new Int32Array(tableSize);
    // Format: (len << 16) | symbol.
    // Initialize with -1 (invalid)
    this.table.fill(-1);

    for (let i = 0; i < lengths.length; i++) {
      const len = lengths[i];
      if (len === 0) continue;

      const c = nextCode[len];
      nextCode[len]++;

      // Reverse bits of code?
      // RFC 1951: "The Huffman codes... are packed starting with the most significant bit..."
      // BUT "Data elements are packed into bytes starting with the least significant bit".
      // BUT "Data elements are packed into bytes starting with the least significant bit".
      // This is the tricky part.
      // "Huffman codes are packed starting with the Most Significant Bit of the code."
      // Example: Code 10 (binary). Length 2.
      // Stream: |...| 0 | 1 | ...
      // Reader reads LSB first.
      // So we read 0, then 1.
      // So the code 10 (binary 2) appears as 0 then 1.
      // If we read integer bits, code 2 (10) -> is that 0 then 1?
      // Yes, 10 is 1*2 + 0*1.
      // Bit 0 is 0. Bit 1 is 1.
      // My BitStream reads LSB.
      // `readBits(2)` returns 2 (10)?
      // Wait. `10` binary. Most significant bit is 1. Least is 0.
      // MSB First means:
      // First bit sent is MSB.
      // Stream: MSB, ..., LSB.
      // `readBits` reads: Bit0, Bit1, ...
      // So Bit0 is MSB?
      // NO. "Data elements are packed LSB first."
      // Huffman codes are MSB first *relative to the code integer*.
      // But packed LSB first into bytes.
      // This usually means we need to reverse the bits of the code to match the LSB-read integer.
      // Example: Code `10` (2). MSB is 1.
      // Stored as: 1 then 0 ? NO.
      // RFC 1951: "Huffman codes are packed ... most significant bit first."
      // "This means that the code 01 is sent 0 then 1."
      // "This is confusing because ... bits .. are LSB."
      // "So code 01 is stored as ... bit 0 is 0, bit 1 is 1."
      // Correct.
      // If I read `readBits(2)`, I get integer with LSB=0, next=1.
      // Value: 1*2 + 0*1 = 2 (10 binary).
      // So `readBits` returns the code integer correctly?
      // Wait, if code is `10` (2). Sent 1 then 0.
      // Bit 0 = 1. Bit 1 = 0.
      // `readBits(2)` -> `0*2 + 1*1` = 1 (01 binary).
      // So `readBits` result is REVERSED relative to standard code integer.
      // Canonical generation produces standard integers (MSB is high).
      // So `c` is standard.
      // Stream has it reversed.
      // So we must REVERSE `c` (length `len`) to get the `readBits` integer.

      const revCode = this.reverseBits(c, len);

      // Populate table
      // We fill all entries `revCode` + `k * (1<<len)`.
      const increment = 1 << len;
      for (let j = revCode; j < tableSize; j += increment) {
        this.table[j] = (len << 16) | i;
      }
    }
  }

  /**
   * Decodes a symbol from the stream.
   * @param {InflateBitStream} stream The bit stream to read from.
   * @returns {number} The decoded symbol.
   */
  decode(stream) {
    // Peek enough bits (safe)
    stream.fillBits(this.maxLen);
    const available = stream.bitCount;
    if (available === 0) {
      throw new Error('Unexpected end of input during decode');
    }

    // We mask based on what's available?
    // But table index requires `maxLen` bits ideally.
    // If we have fewer, we pad with 0s (implicit in read) or just take what is there.
    // Since `bitBuffer` has 0s beyond `bitCount` (if managed well) or we mask.
    const peek = stream.bitBuffer & ((1 << this.maxLen) - 1);
    const entry = this.table[peek];

    if (entry === -1) {
      throw new Error('Invalid Huffman Code');
    }

    const len = entry >>> 16;
    const sym = entry & 0xFFFF;

    stream.dropBits(len);
    return sym;
  }

  /**
   * Reverses bits of integer `val` for `len` bits.
   * @param {number} val The code value.
   * @param {number} len The bit length.
   * @returns {number} The reversed value.
   */
  reverseBits(val, len) {
    let res = 0;
    for (let i = 0; i < len; i++) {
      if ((val >>> i) & 1) {
        res |= 1 << (len - 1 - i);
      }
    }
    return res;
  }
}
