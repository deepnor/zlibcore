/**
 * @module deflate/bitstream
 * @description Manages writing bits to the output buffer (LSB packing) for Deflate (RFC 1951).
 */

/**
 * A bit stream writer that packs bits into a Uint8Array.
 * Complies with RFC 1951, Section 3.1.1:
 * "Bits within a byte are read from the least significant bit (bit 0)
 * to the most significant bit (bit 7)."
 */
export default class DeflateBitStream {
  /**
   * @param {number} [initialSize] - Initial buffer size in bytes.
   */
  constructor(initialSize = 1024) {
    /**
     * The output buffer.
     * @type {Uint8Array}
     * @private
     */
    this.buffer = new Uint8Array(initialSize);

    /**
     * Current byte position in the buffer.
     * @type {number}
     * @private
     */
    this.byteOffset = 0;

    /**
     * Current bit buffer (accumulator).
     * @type {number}
     * @private
     */
    this.bitBuffer = 0;

    /**
     * Number of bits currently in the bit buffer.
     * @type {number}
     * @private
     */
    this.bitCount = 0;
  }

  /**
   * Writes a sequence of bits to the stream.
   * @param {number} value - The integer containing the bits to write.
   * @param {number} count - The number of bits to write (0-32).
   */
  writeBits(value, count) {
    let val = value;
    let n = count;

    while (n > 0) {
      // Append bits to the accumulator
      this.bitBuffer |= (val & 1) << this.bitCount;
      val >>>= 1;
      n--;
      this.bitCount++;

      // If we have a full byte (or more), flush it
      if (this.bitCount === 8) {
        this.writeToBuffer(this.bitBuffer);
        this.bitBuffer = 0;
        this.bitCount = 0;
      }
    }
  }

  /**
   * Optimized write for multiple bits at once.
   * @param {number} value The bits to write.
   * @param {number} count Number of bits.
   */
  writeBitsFast(value, count) {
    if (count === 0) return;

    // Combine current bits with new bits
    this.bitBuffer |= (value << this.bitCount);
    this.bitCount += count;

    // Flush full bytes
    while (this.bitCount >= 8) {
      this.writeToBuffer(this.bitBuffer & 0xFF);
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  /**
   * Ensures capacity in the buffer.
   * @private
   * @param {number} bytesNeeded Number of bytes to ensure.
   */
  ensureCapacity(bytesNeeded) {
    if (this.byteOffset + bytesNeeded > this.buffer.length) {
      const newSize = Math.max(
        this.buffer.length * 2,
        this.byteOffset + bytesNeeded + 1024,
      );
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }
  }

  /**
   * Writes a byte to the buffer.
   * @private
   * @param {number} byte The byte to write.
   */
  writeToBuffer(byte) {
    this.ensureCapacity(1);
    this.buffer[this.byteOffset++] = byte;
  }

  /**
   * Aligns the bit stream to the next byte boundary.
   */
  align() {
    if (this.bitCount > 0) {
      this.writeToBuffer(this.bitBuffer & 0xFF);
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
  }

  /**
   * Returns the packed data as a Uint8Array.
   * @returns {Uint8Array} The buffer.
   */
  getView() {
    return this.buffer.subarray(0, this.byteOffset);
  }
}
