/**
 * @module inflate/inflate
 * @description Inflate Orchestrator (RFC 1951).
 */

import InflateBitStream from './bitstream.js';
import HuffmanDecoder from './huffman.js';

// Constants from RFC 1951
const BL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const EXTRA_LBITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const EXTRA_DBITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/**
 * Inflate Decompressor.
 */
export default class Inflate {
  /**
   * @param {Uint8Array} input Compressed data.
   */
  constructor(input) {
    this.stream = new InflateBitStream(input);
    this.output = new Uint8Array(1024); // Dynamically expandable
    this.outputPos = 0;
  }

  /**
   * Decompresses the data.
   * @returns {Uint8Array} Decompressed data.
   */
  decompress() {
    let bfinal = 0;
    while (!bfinal) {
      bfinal = this.stream.readBits(1);
      const btype = this.stream.readBits(2);

      switch (btype) {
        case 0:
          this.processStored();
          break;
        case 1:
          this.processFixed();
          break;
        case 2:
          this.processDynamic();
          break;
        default:
          throw new Error(`Invalid Block Type: ${btype}`);
      }
    }
    return this.output.subarray(0, this.outputPos);
  }

  /**
   * Process Type 0: Stored (Uncompressed).
   */
  processStored() {
    this.stream.align();
    const len = this.stream.readBits(16);
    const nlen = this.stream.readBits(16);

    if ((len ^ 0xFFFF) !== nlen) {
      throw new Error('Invalid Stored Block: LEN != ~NLEN');
    }

    for (let i = 0; i < len; i++) {
      const val = this.stream.readBits(8);
      this.writeByte(val);
    }
  }

  /**
   * Process Type 1: Fixed Huffman.
   */
  processFixed() {
    // Stub for fixed, just placeholder logic or error if strict.
    // Assuming Deflate uses Dynamic.
    // But for completeness:
    const litLens = new Uint8Array(288);
    for (let i = 0; i <= 143; i++) litLens[i] = 8;
    for (let i = 144; i <= 255; i++) litLens[i] = 9;
    for (let i = 256; i <= 279; i++) litLens[i] = 7;
    for (let i = 280; i <= 287; i++) litLens[i] = 8;

    const distLens = new Uint8Array(30).fill(5);

    const litTree = new HuffmanDecoder(litLens);
    const distTree = new HuffmanDecoder(distLens);

    this.processBlock(litTree, distTree);
  }

  /**
   * Process Type 2: Dynamic Huffman.
   */
  processDynamic() {
    const HLIT = this.stream.readBits(5) + 257;
    const HDIST = this.stream.readBits(5) + 1;
    const HCLEN = this.stream.readBits(4) + 4;

    // Read code lengths for code length alphabet
    const codeLens = new Uint8Array(19).fill(0);
    for (let i = 0; i < HCLEN; i++) {
      codeLens[BL_ORDER[i]] = this.stream.readBits(3);
    }

    const codeLenTree = new HuffmanDecoder(codeLens);

    // Decode Lit/Len and Dist lengths
    const allLens = new Uint8Array(HLIT + HDIST);
    let i = 0;
    while (i < HLIT + HDIST) {
      const sym = codeLenTree.decode(this.stream);
      if (sym < 16) {
        allLens[i++] = sym;
      } else if (sym === 16) {
        const repeat = this.stream.readBits(2) + 3;
        const last = allLens[i - 1];
        for (let j = 0; j < repeat; j++) allLens[i++] = last;
      } else if (sym === 17) {
        const repeat = this.stream.readBits(3) + 3;
        for (let j = 0; j < repeat; j++) allLens[i++] = 0;
      } else if (sym === 18) {
        const repeat = this.stream.readBits(7) + 11;
        for (let j = 0; j < repeat; j++) allLens[i++] = 0;
      }
    }

    const litLens = allLens.subarray(0, HLIT);
    const distLens = allLens.subarray(HLIT);

    const litTree = new HuffmanDecoder(litLens);
    const distTree = new HuffmanDecoder(distLens);

    this.processBlock(litTree, distTree);
  }

  /**
   * Decodes data using the trees.
   * @param {HuffmanDecoder} litTree Literal/Length tree.
   * @param {HuffmanDecoder} distTree Distance tree.
   */
  processBlock(litTree, distTree) {
    let active = true;
    while (active) {
      const sym = litTree.decode(this.stream);
      if (sym < 256) {
        // Literal
        this.writeByte(sym);
      } else if (sym === 256) {
        // EOB
        active = false;
        return;
      } else {
        // Length (257..285)
        let len = sym - 257;
        if (len >= 29) {
          throw new Error('Invalid Length Symbol');
        }
        const extraBits = EXTRA_LBITS[len];
        const base = LENGTH_BASE[len];
        if (extraBits > 0) {
          len = base + this.stream.readBits(extraBits);
        } else {
          len = base;
        }

        // Distance
        const distSym = distTree.decode(this.stream);
        const distExtra = EXTRA_DBITS[distSym];
        const distBase = DIST_BASE[distSym];
        let dist = distBase;
        if (distExtra > 0) {
          dist = distBase + this.stream.readBits(distExtra);
        }

        this.copyMatch(len, dist);
      }
    }
  }

  /**
   * Writes a byte to output.
   * @param {number} byte The byte to write.
   */
  writeByte(byte) {
    if (this.outputPos >= this.output.length) {
      const newSize = this.output.length * 2;
      const newBuf = new Uint8Array(newSize);
      newBuf.set(this.output);
      this.output = newBuf;
    }
    this.output[this.outputPos++] = byte;
  }

  /**
   * Copies a match from the output buffer.
   * @param {number} len Match length.
   * @param {number} dist Backward distance.
   */
  copyMatch(len, dist) {
    let srcPos = this.outputPos - dist;
    if (srcPos < 0) {
      throw new Error(`Invalid distance: ${dist} > ${this.outputPos}`);
    }

    for (let i = 0; i < len; i++) {
      this.writeByte(this.output[srcPos++]);
    }
  }
}
