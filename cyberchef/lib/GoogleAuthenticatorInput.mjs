/** @license MIT @copyright 2026 3mg */
import Jimp from 'jimp/es/index.js';
import jsQR from 'jsqr';
import {decodeAll, LIMIT} from './GoogleAuthenticatorMigration.mjs';

export const INPUT_ENVELOPE = 'cyberchef-google-authenticator-inputs-v1';
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', {fatal:true});

function bytesOf(input) {
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw Error('Open a PNG/JPEG QR image or paste OTP URLs');
}

function imageSize(bytes) {
    const png = [137,80,78,71,13,10,26,10];
    if (png.every((value, index) => bytes[index] === value)) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let offset = 8, dimensions;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset);
            if (length > bytes.length - offset - 12) throw Error('Truncated PNG chunk');
            const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
            if (type === 'IHDR') {
                if (dimensions || offset !== 8 || length !== 13) throw Error('Invalid or duplicate PNG dimensions');
                dimensions = [view.getUint32(offset + 8), view.getUint32(offset + 12)];
            } else if (!dimensions) throw Error('Missing PNG dimensions');
            offset += length + 12;
            if (type === 'IEND') {
                if (length !== 0 || offset !== bytes.length) throw Error('Invalid PNG ending');
                return dimensions;
            }
        }
        throw Error('Truncated PNG image');
    }
    if (bytes[0] === 255 && bytes[1] === 216) {
        let offset = 2, dimensions, entropy = false;
        while (offset < bytes.length) {
            if (bytes[offset++] !== 255) {
                if (entropy) continue;
                throw Error('Invalid JPEG header');
            }
            while (bytes[offset] === 255) offset++;
            const marker = bytes[offset++];
            if (marker === 0 && entropy) continue;
            if (marker === 217) {
                if (!dimensions) throw Error('Missing JPEG dimensions');
                return dimensions;
            }
            if (marker === 1 || marker >= 208 && marker <= 215) continue;
            entropy = false;
            if (offset + 2 > bytes.length) break;
            const length = bytes[offset] * 256 + bytes[offset + 1];
            if (length < 2 || offset + length > bytes.length) throw Error('Truncated JPEG header');
            if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
                if (length < 8 || dimensions) throw Error('Invalid or duplicate JPEG frame');
                dimensions = [bytes[offset + 5] * 256 + bytes[offset + 6], bytes[offset + 3] * 256 + bytes[offset + 4]];
            }
            if (marker === 218) entropy = true;
            offset += length;
        }
        throw Error('Truncated JPEG image');
    }
    return null;
}

function maskCode(pixels, width, height, location) {
    const corners = [location.topLeftCorner, location.topRightCorner, location.bottomRightCorner, location.bottomLeftCorner];
    const left = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x))));
    const right = Math.min(width - 1, Math.ceil(Math.max(...corners.map(p => p.x))));
    const top = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y))));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(...corners.map(p => p.y))));
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            let positive = false, negative = false;
            for (let i = 0; i < 4; i++) {
                const a = corners[i], b = corners[(i + 1) % 4];
                const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
                if (cross > 0) positive = true;
                if (cross < 0) negative = true;
            }
            if (!(positive && negative)) pixels.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
        }
    }
}

function scanBitmap(image) {
    const pixels = new Uint8ClampedArray(image.bitmap.data);
    const width = image.getWidth(), height = image.getHeight();
    // jsQR reads RGB but does not composite alpha. Transparent screenshots must
    // be blended onto white before detection, not merely assigned a background.
    for (let p = 0; p < pixels.length; p += 4) {
        const alpha = pixels[p + 3] / 255;
        for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(pixels[p + c] * alpha + 255 * (1 - alpha));
        pixels[p + 3] = 255;
    }
    const regions = [];
    // Two adjacent QR codes can confuse jsQR's finder-pattern selection even
    // before the first code is decoded. Overlapping crops isolate those codes.
    for (const [columns, rows] of [[2,1],[1,2],[2,2]]) {
        const w = columns === 1 ? width : Math.ceil(width * 0.6);
        const h = rows === 1 ? height : Math.ceil(height * 0.6);
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
            regions.push({x:col ? width-w : 0, y:row ? height-h : 0, w, h});
        }
    }
    function findCode() {
        const entire = jsQR(pixels, width, height, {inversionAttempts:'attemptBoth'});
        if (entire) return entire;
        for (const region of regions) {
            const cropped = new Uint8ClampedArray(region.w * region.h * 4);
            for (let row = 0; row < region.h; row++) {
                const start = ((region.y + row) * width + region.x) * 4;
                cropped.set(pixels.subarray(start, start + region.w * 4), row * region.w * 4);
            }
            const code = jsQR(cropped, region.w, region.h, {inversionAttempts:'attemptBoth'});
            if (!code) continue;
            for (const corner of ['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner']) {
                code.location[corner].x += region.x;
                code.location[corner].y += region.y;
            }
            return code;
        }
        return null;
    }
    const texts = [];
    for (let index = 0; index <= 64; index++) {
        const code = findCode();
        if (!code) return texts;
        if (index === 64) throw Error('Maximum 64 QR codes in one image');
        if (code.data.length > LIMIT) throw Error('QR text exceeds 512 KiB');
        texts.push(code.data);
        maskCode(pixels, width, height, code.location);
    }
    return texts;
}

async function readImage(bytes, dimensions) {
    if (bytes.length > MAX_IMAGE_BYTES) throw Error('QR image exceeds 16 MiB');
    const [width, height] = dimensions;
    if (!width || !height || width > MAX_PIXELS || height > MAX_PIXELS || width * height > MAX_PIXELS) throw Error('QR image exceeds 16 megapixels');
    let image;
    try {
        // Pass bytes only: Jimp must never treat user text as a path or URL.
        image = await Jimp.read(Buffer.from(bytes));
    } catch { throw Error('Could not decode the PNG/JPEG image'); }
    if (image.getWidth() * image.getHeight() > MAX_PIXELS) throw Error('QR image exceeds 16 megapixels');
    let results = scanBitmap(image);
    if (!results.length) {
        image.background(0xFFFFFFFF).normalize().greyscale();
        results = scanBitmap(image);
    }
    if (!results.length) throw Error('No readable QR code found in the image');
    return results;
}

function textLines(text) {
    if (text.length > LIMIT) throw Error('OTP text exceeds 512 KiB');
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

async function readBytes(bytes) {
    if (bytes.length > MAX_IMAGE_BYTES) throw Error('Input file exceeds 16 MiB');
    const dimensions = imageSize(bytes);
    if (dimensions) return readImage(bytes, dimensions);
    let text;
    try { text = utf8.decode(bytes); } catch { throw Error('Unsupported input: use PNG/JPEG images or OTP URL text'); }
    return textLines(text);
}

export async function accountsFromInput(input) {
    let text, bytes;
    if (typeof input === 'string') {
        if (input.length > MAX_INPUT_BYTES) throw Error('Combined input exceeds 32 MiB');
        text = input;
    } else {
        bytes = bytesOf(input);
        if (bytes.length > MAX_INPUT_BYTES) throw Error('Combined input exceeds 32 MiB');
        if (imageSize(bytes)) return decodeAll(await readBytes(bytes));
        try { text = utf8.decode(bytes); } catch { throw Error('Unsupported input: use PNG/JPEG images or OTP URL text'); }
    }
    let envelope;
    if (text.trimStart().startsWith('{')) {
        try { envelope = JSON.parse(text); } catch { throw Error('Invalid combined OTP input'); }
        if (envelope.type !== INPUT_ENVELOPE || !Array.isArray(envelope.inputs) || !envelope.inputs.length || envelope.inputs.length > 500) throw Error('Invalid combined OTP input');
    }
    if (!envelope) return decodeAll(textLines(text));
    const urls = [];
    let totalBytes = 0;
    for (const entry of envelope.inputs) {
        if (!entry || typeof entry.data !== 'string') throw Error('Invalid combined OTP entry');
        if (entry.encoding === 'text') {
            totalBytes += entry.data.length;
            urls.push(...textLines(entry.data));
        } else if (entry.encoding === 'base64') {
            if (entry.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || entry.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data)) throw Error('Invalid combined image encoding');
            const decoded = Uint8Array.from(atob(entry.data), c => c.charCodeAt(0));
            totalBytes += decoded.length;
            urls.push(...await readBytes(decoded));
        } else throw Error('Unknown combined OTP entry encoding');
        if (totalBytes > MAX_INPUT_BYTES || urls.length > 500) throw Error('Combined input exceeds the 32 MiB or 500 QR limit');
    }
    return decodeAll(urls);
}
