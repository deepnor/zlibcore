/**
 * @module zlibcore
 * @description Main Entry Point.
 */

import Deflate from './deflate/deflate.js';
import Inflate from './inflate/inflate.js';
import ZlibHeader from './zlib/header.js';
import adler32 from './adler32/adler32.js';

/**
 * ZlibCore Facade.
 */
export const ZlibCore = {
  /**
   * Compresses data.
   * @param {Uint8Array} data The input data to compress.
   * @returns {Uint8Array} The compressed data with ZLIB header and checksum.
   */
  compress(data) {
    if (!(data instanceof Uint8Array)) throw new TypeError('Input must be Uint8Array');

    // 1. Header
    const header = ZlibHeader.generate();

    // 2. Deflate
    const deflate = new Deflate();
    const compressed = deflate.compress(data);

    // 3. Adler32
    const adler = adler32(data);

    // Assemble: Header + Buffer + Adler(4 bytes Big Endian)
    const result = new Uint8Array(header.length + compressed.length + 4);
    result.set(header, 0);
    result.set(compressed, header.length);

    const adlerPos = header.length + compressed.length;
    const view = new DataView(result.buffer);
    view.setUint32(adlerPos, adler, false); // Big Endian

    return result;
  },

  /**
   * Decompresses data.
   * @param {Uint8Array} data The ZLIB compressed data.
   * @returns {Uint8Array} The decompressed data.
   */
  decompress(data) {
    if (!(data instanceof Uint8Array)) throw new TypeError('Input must be Uint8Array');

    // 1. Header (2 bytes)
    const header = data.subarray(0, 2);
    ZlibHeader.validate(header);

    // 2. Inflate (until EOB implicitly handled by consume?)
    // We pass the slice starting at 2.
    // But Inflate might read until it finishes block.
    // And we need Adler32 at the end (4 bytes).
    // We should pass subarray(2, length - 4)?
    // RFC doesn't say stream ends at Adler. It says Adler follows.
    // If we pass strictly the deflate stream area.
    // Deflate stream area is (Length - 6).

    if (data.length < 6) throw new Error('Data too short');

    const payload = data.subarray(2, data.length - 4);
    const inflate = new Inflate(payload);
    const result = inflate.decompress();

    // 3. Verify Adler32
    const footerPos = data.length - 4;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const expectedAdler = view.getUint32(footerPos, false); // Big Endian

    const actualAdler = adler32(result);
    if (actualAdler !== expectedAdler) {
      if ((actualAdler >>> 0) !== expectedAdler) {
        throw new Error('Adler32 Checksum Failed');
      }
    }

    return result;
  },

  /**
   * Expose Checksum utility.
   */
  createChecksum: adler32,
};

export default ZlibCore;