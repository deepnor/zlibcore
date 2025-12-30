# zlibcore

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

A strict, zero-dependency, RFC 1950 (ZLIB) and RFC 1951 (DEFLATE) compliant compression library for JavaScript.

## Features

- **Zero Dependencies:** Pure Vanilla JS.
- **Environment Agnostic:** Runs in Node.js, Browsers, Workers, Deno, Bun.
- **Strict RFC Compliance:**
  - RFC 1950 (ZLIB Wrapper, Adler-32 Checksum)
  - RFC 1951 (DEFLATE Compressed Data Format)
- **Oracle Verified:** Cross-verified against native Node.js `zlib` for bit-exact compatibility.
- **Strict Engineering:** Lint-free (AirBnB Strict), strictly typed (JSDoc), no `var`.

## Installation

```bash
npm install zlibcore
```

## Usage

### Compression

```javascript
import { ZlibCore } from 'zlibcore';

const input = new TextEncoder().encode("Hello World");
const compressed = ZlibCore.compress(input);

console.log(compressed); // Uint8Array(ZLIB Stream)
```

### Decompression

```javascript
import { ZlibCore } from 'zlibcore';

// compressed is Uint8Array
const decompressed = ZlibCore.decompress(compressed);
const text = new TextDecoder().decode(decompressed);

console.log(text); // "Hello World"
```

## API Reference

### `ZlibCore.compress(data: Uint8Array, options?: Object): Uint8Array`

Compresses data using DEFLATE algorithm wrapped in ZLIB container.

- `data`: Input buffer.
- `options`:
  - `level`: Compression level (Currently default is supported).

### `ZlibCore.decompress(data: Uint8Array): Uint8Array`

Decompresses a ZLIB stream.

- `data`: Input buffer (must have valid ZLIB header and Adler-32 checksum).
- Throws error if checksum mismatch or invalid header/data.

## Architecture & Compliance

- **Adler-32:** Implemented using BigInt to strictly handle modulo 65521.
- **LZ77:** Custom sliding window implementation (32KB window).
- **Huffman:** Dynamic Huffman coding support.

## Verification

This project adheres to the **SIEP-1.0** protocol:
1. **Zero Lint Errors:** Enforced by ESLint.
2. **Oracle Tests:** All logic verified against Node.js native implementation.

## License

MIT