import { ZlibCore } from 'zlibcore';
import fs from 'node:fs';

const configState = {
    appName: 'ZlibCore Demo',
    version: 1.0,
    features: {
        compression: true,
        speed: 'fast',
        encryption: false
    },
    data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: Math.random() }))
};

// 1. Serialize
const jsonString = JSON.stringify(configState);
const encoder = new TextEncoder();
const rawBytes = encoder.encode(jsonString);

console.log(`JSON Size: ${rawBytes.length} bytes`);

// 2. Compress
const compressed = ZlibCore.compress(rawBytes);
console.log(`Compressed Config Size: ${compressed.length} bytes`);

// 3. Save
fs.writeFileSync('config.zlib', compressed);

// 4. Verify (Decompress)
const restored = ZlibCore.decompress(fs.readFileSync('config.zlib'));
const decoder = new TextDecoder();
const restoredJson = decoder.decode(restored);
const restoredParams = JSON.parse(restoredJson);

console.log('Restoration verified:', restoredParams.appName === configState.appName);
