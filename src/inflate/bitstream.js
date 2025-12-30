/**
 * @module inflate/bitstream
 * @description Manages reading bits from the input buffer (LSB) for Inflate (RFC 1951).
 */

/**
 * A bit stream reader.
 */
export default class InflateBitStream {
  /**
   * @param {Uint8Array} buffer The compressed data buffer.
   */
  constructor(buffer) {
    this.buffer = buffer;
    this.bytePos = 0;
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  /**
   * Ensures that at least `count` bits are in the bit buffer.
   * @param {number} count Number of bits to ensure (max 32).
   */
  ensureBits(count) {
    while (this.bitCount < count) {
      if (this.bytePos >= this.buffer.length) {
        throw new Error(`Unexpected end of input. Need ${count}, have ${this.bitCount}, bytePos ${this.bytePos}, len ${this.buffer.length}`);
      }
      this.bitBuffer |= this.buffer[this.bytePos++] << this.bitCount;
      this.bitCount += 8;
    }
  }

  /**
   * Attempts to ensure at least `count` bits, but stops at EOF.
   * @param {number} count Number of bits to fill.
   */
  fillBits(count) {
    while (this.bitCount < count) {
      if (this.bytePos >= this.buffer.length) {
        break;
      }
      this.bitBuffer |= this.buffer[this.bytePos++] << this.bitCount;
      this.bitCount += 8;
    }
  }

  /**
   * Reads `count` bits from the stream.
   * @param {number} count Number of bits to read.
   */
  readBits(count) {
    this.ensureBits(count);
    const val = this.bitBuffer & ((1 << count) - 1);
    this.bitBuffer >>>= count;
    this.bitCount -= count;
    return val;
  }

  /**
   * Peeks at `count` bits without consuming them.
   * @param {number} count Number of bits to peek.
   */
  peekBits(count) {
    this.ensureBits(count);
    return this.bitBuffer & ((1 << count) - 1);
  }

  /**
   * Drops `count` bits from the stream.
   * @param {number} count Number of bits to drop.
   */
  dropBits(count) {
    this.ensureBits(count);
    this.bitBuffer >>>= count;
    this.bitCount -= count;
  }

  /**
   * Align to byte boundary.
   */
  align() {
    const bytesBuffered = this.bitCount >> 3;
    this.bytePos -= bytesBuffered;
    this.bitCount = 0;
    this.bitBuffer = 0;
  }
}
