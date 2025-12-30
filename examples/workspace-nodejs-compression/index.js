import { ZlibCore } from 'zlibcore';
import fs from 'node:fs';

// 1. Ingest Data
const inputPath = './input.txt';
// Create dummy file if not exists
if (!fs.existsSync(inputPath)) {
    fs.writeFileSync(inputPath, 'This is a sample text file for zlibcore compression testing. Repeat. Repeat.');
}

const inputBuffer = fs.readFileSync(inputPath);

// 2. Execute Compression (RFC 1950/1951)
console.log(`Original Size: ${inputBuffer.length} bytes`);
const compressedBuffer = ZlibCore.compress(inputBuffer);
console.log(`Compressed Size: ${compressedBuffer.length} bytes`);

// 3. Artifact Generation
fs.writeFileSync('output.zlib', compressedBuffer);
console.log('Artifact "output.zlib" generated.');
