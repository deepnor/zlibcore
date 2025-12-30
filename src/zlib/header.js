/**
 * @module zlib/header
 * @description ZLIB Header (RFC 1950).
 */

// adler32 import removed (unused here)

/**
 * ZLIB Header Logic.
 */
export default class ZlibHeader {
  /**
   * Generates a ZLIB header.
   * CM = 8 (Deflate).
   * CINFO = 7 (32K Window).
   * FLEVEL = 0 (Fastest) - 3 (Slowest). Default 2.
   * @returns {Uint8Array} 2-byte header.
   */
  static generate() {
    // RFC 1950
    // CMF: CM (0-3) = 8. CINFO (4-7) = 7 (32K).
    // 7 << 4 | 8 = 112 | 8 = 120 (0x78).
    const CMF = 120;

    // FLG: FCHECK (0-4), FDICT (5), FLEVEL (6-7).
    // FLEVEL = 2 (Default).
    // FDICT = 0.
    // FLG (partial) = 2 << 6 = 128.
    // FCHECK must satisfy (CMF * 256 + FLG) % 31 == 0.

    let FLG = 128; // 0x80
    const check = (CMF * 256 + FLG) % 31;
    if (check !== 0) {
      FLG += (31 - check);
    }

    return new Uint8Array([CMF, FLG]);
  }

  /**
   * Validates a ZLIB header.
   * @param {Uint8Array} header - First 2 bytes.
   * @throws {Error} If invalid.
   */
  static validate(header) {
    if (header.length < 2) throw new Error('Header too short');
    const CMF = header[0];
    const FLG = header[1];

    if ((CMF & 0x0F) !== 8) throw new Error('Unsupported Compression Method');
    if ((CMF >> 4) > 7) throw new Error('Window size too large'); // We only support up to 32K
    if ((FLG & 0x20) !== 0) throw new Error('Dictionary not supported');

    if ((CMF * 256 + FLG) % 31 !== 0) throw new Error('Header Checksum Failed');
  }
}