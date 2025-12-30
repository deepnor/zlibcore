/**
 * @module deflate/deflate
 * @description Deflate Orchestrator (RFC 1951).
 */

import DeflateBitStream from './bitstream.js';
import { LZ77, TokenType } from './lz77.js';
import { HuffmanTree, BL_ORDER } from './huffman.js';

// RFC 1951 Tables
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
 * Deflate compressor.
 */
export default class Deflate {
  /**
   *
   */
  constructor() {
    this.stream = new DeflateBitStream();
    this.lz77 = new LZ77();
  }

  /**
   * Compresses input data.
   * @param {Uint8Array} input The input data.
   * @param {boolean} [lastBlock] Whether this is the last block.
   * @returns {Uint8Array} Compressed block.
   */
  compress(input, lastBlock = true) {
    // 1. LZ77
    const tokens = this.lz77.process(input);

    // 2. Build Trees
    const litLenTree = new HuffmanTree(286);
    const distTree = new HuffmanTree(30);

    // Count freqs
    tokens.forEach((t) => {
      if (t.type === TokenType.LITERAL) {
        litLenTree.count(t.value);
      } else {
        // Match
        const len = t.value;
        const dist = t.extra;

        // Find Length Code
        let lenCode = 0;
        for (let i = 0; i < LENGTH_BASE.length; i++) {
          if (len >= LENGTH_BASE[i]) lenCode = i;
          else break;
        }
        litLenTree.count(lenCode + 257);

        // Find Dist Code
        let distCode = 0;
        for (let i = 0; i < DIST_BASE.length; i++) {
          if (dist >= DIST_BASE[i]) distCode = i;
          else break;
        }
        distTree.count(distCode);
      }
    });

    litLenTree.count(256); // EOB symbol

    litLenTree.build();
    distTree.build();

    // 3. Write Block Header
    // BFINAL
    this.stream.writeBits(lastBlock ? 1 : 0, 1);
    // BTYPE: 10 (Dynamic Huffman)
    this.stream.writeBits(2, 2);

    // 4. Encode Code Lengths
    this.writeDynamicHeader(litLenTree, distTree);

    // 5. Write Data
    for (const t of tokens) {
      if (t.type === TokenType.LITERAL) {
        const c = litLenTree.getCode(t.value);
        this.stream.writeBits(this.reverseBits(c.code, c.len), c.len);
      } else {
        // Match
        const len = t.value;
        const dist = t.extra;

        // Length
        let lenCode = 0;
        for (let i = 0; i < LENGTH_BASE.length; i++) {
          if (len >= LENGTH_BASE[i]) lenCode = i;
          else break;
        }
        const c = litLenTree.getCode(lenCode + 257);
        this.stream.writeBits(this.reverseBits(c.code, c.len), c.len);

        // Extra bits for Length
        const extraLen = EXTRA_LBITS[lenCode];
        if (extraLen > 0) {
          this.stream.writeBits(len - LENGTH_BASE[lenCode], extraLen);
        }

        // Distance
        let distCode = 0;
        for (let i = 0; i < DIST_BASE.length; i++) {
          if (dist >= DIST_BASE[i]) distCode = i;
          else break;
        }
        const d = distTree.getCode(distCode);
        this.stream.writeBits(this.reverseBits(d.code, d.len), d.len);

        // Extra bits for Distance (Not reversed, LSB first per RFC)
        const extraDist = EXTRA_DBITS[distCode];
        if (extraDist > 0) {
          this.stream.writeBits(dist - DIST_BASE[distCode], extraDist);
        }
      }
    }

    // 6. Write EOB
    const eob = litLenTree.getCode(256);
    this.stream.writeBits(this.reverseBits(eob.code, eob.len), eob.len);

    this.stream.align();
    return this.stream.getView();
  }

  /**
   * Writes the Dynamic Huffman Header.
   * @param {HuffmanTree} litLen Literal/Length Tree.
   * @param {HuffmanTree} dist Distance Tree.
   */
  writeDynamicHeader(litLen, dist) {
    // Run-Length Encode the code lengths of both trees
    const combinedLens = [...litLen.lens, ...dist.lens];
    // RFC: HLIT = # of literal/length codes - 257 (257..286)
    // HDIST = # of dist codes - 1 (1..32)
    const HLIT = 286 - 257;
    const HDIST = 30 - 1;

    // RLE logic for code lengths
    const codeLens = []; // Symbols for the code length alphabet (0-18)
    const codeExtra = [];

    let i = 0;
    while (i < combinedLens.length) {
      const val = combinedLens[i];
      let runLen = 1;
      while (i + runLen < combinedLens.length && combinedLens[i + runLen] === val) {
        runLen++;
      }

      if (val === 0) {
        while (runLen >= 11) {
          const n = Math.min(runLen, 138);
          codeLens.push(18);
          codeExtra.push(n - 11);
          runLen -= n;
          i += n;
        }
        if (runLen >= 3) {
          const n = Math.min(runLen, 10);
          codeLens.push(17);
          codeExtra.push(n - 3);
          runLen -= n;
          i += n;
        }
      } else {
        // Non-zero
        codeLens.push(val);
        codeExtra.push(-1);
        i++;
        runLen--;

        // Check repeats
        while (runLen >= 3) {
          const n = Math.min(runLen, 6);
          codeLens.push(16);
          codeExtra.push(n - 3);
          runLen -= n;
          i += n;
        }
      }

      // Handle remaining singles
      while (runLen > 0) {
        codeLens.push(val);
        codeExtra.push(-1);
        i++;
        runLen--;
      }
    }

    // Build Code Length Tree
    const codeLenTree = new HuffmanTree(19);
    codeLens.forEach((sym) => codeLenTree.count(sym));
    codeLenTree.build();

    // Header
    this.stream.writeBits(HLIT, 5);
    this.stream.writeBits(HDIST, 5);

    let HCLEN = 15;
    for (let k = 18; k >= 0; k--) {
      if (codeLenTree.lens[BL_ORDER[k]] > 0) {
        HCLEN = k - 3;
        // If k < 4 (first 4 codes), HCLEN < 1. 0 is min.
        // RFC: HCLEN = #code len codes - 4.
        // We send (HCLEN + 4) items.
        // HCLEN is 4 bits (0-15). So we can send 4 to 19 codes.
        // If k=3 (4th item). HCLEN = 0.
        break;
      }
    }
    if (HCLEN < 0) HCLEN = 0;

    this.stream.writeBits(HCLEN, 4);

    // Write code lengths for code length alphabet
    for (let j = 0; j < HCLEN + 4; j++) {
      this.stream.writeBits(codeLenTree.lens[BL_ORDER[j]], 3);
    }

    // Write the RLE code lengths
    for (let k = 0; k < codeLens.length; k++) {
      const sym = codeLens[k];
      const c = codeLenTree.getCode(sym);
      // Code Length Alphabet Codes are ALSO Huffman Codes. Need Reversal?
      // RFC 1951: "The code length codes ... are Huffman codes."
      // Yes, all Huffman codes are packed MSB first.
      this.stream.writeBits(this.reverseBits(c.code, c.len), c.len);

      // Extra bits
      if (sym === 16) this.stream.writeBits(codeExtra[k], 2);
      else if (sym === 17) this.stream.writeBits(codeExtra[k], 3);
      else if (sym === 18) this.stream.writeBits(codeExtra[k], 7);
    }
  }

  /**
   * Reverses bits of integer `val` for `len` bits.
   * @param {number} val The value.
   * @param {number} len The bit length.
   * @returns {number} Reversed value.
   */
  reverseBits(val, len) {
    let res = 0;
    for (let i = 0; i < len; i++) {
      if ((val >>> i) & 1) {
        res |= 1 << (len - 1 - i);
      }
    }
    return res; // Ensure integer range? JS number is 53 bit. OK.
  }
}
