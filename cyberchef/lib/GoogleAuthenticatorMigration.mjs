// Browser adaptation of itamaker/gauth2apple (MIT), commit 97eda36.
// Bounds, strict wire types/enums, UTF-8 and batch validation added here.
const utf8 = new TextDecoder('utf-8', {fatal: true});
export const LIMIT = 524288;
function fields(bytes) {
  let pos = 0;
  const result = new Map();
  function varint() {
    let n = 0n;
    for (let i = 0; i < 10; i++) {
      if (pos >= bytes.length) throw Error('Truncated protobuf varint');
      const b = bytes[pos++];
      if (i === 9 && b > 1) throw Error('Protobuf integer overflow');
      n |= BigInt(b & 127) << BigInt(i * 7);
      if (!(b & 128)) return n;
    }
    throw Error('Protobuf varint too long');
  }
  while (pos < bytes.length) {
    const tag = varint();
    const no = Number(tag >> 3n), wire = Number(tag & 7n);
    if (!no || no > 536870911) throw Error('Invalid protobuf field');
    let value;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const size = varint();
      if (size > BigInt(bytes.length - pos)) throw Error('Truncated protobuf field');
      value = bytes.subarray(pos, pos + Number(size));
      pos += Number(size);
    } else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      if (pos + size > bytes.length) throw Error('Truncated protobuf field');
      value = bytes.subarray(pos, pos + size); pos += size;
    } else throw Error('Unsupported protobuf wire type');
    const values = result.get(no) || [];
    values.push({wire, value}); result.set(no, values);
  }
  return result;
}
function one(f, n, wire, fallback) {
  const v = f.get(n);
  if (!v) return fallback;
  if (v.length !== 1 || v[0].wire !== wire) throw Error('Invalid or duplicate protobuf field');
  return v[0].value;
}
export function base32(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, buffer = 0, out = '';
  for (const b of bytes) {
    buffer = (buffer << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += alphabet[(buffer >>> bits) & 31]; }
    buffer &= (1 << bits) - 1;
  }
  if (bits) out += alphabet[(buffer << (5 - bits)) & 31];
  return out;
}
export function decodeMigration(input) {
  if (typeof input !== 'string' || input.length > LIMIT) throw Error('Input exceeds 512 KiB');
  let url;
  try { url = new URL(input.trim()); } catch { throw Error('Expected an otpauth-migration://offline URL'); }
  if (url.protocol !== 'otpauth-migration:' || url.hostname !== 'offline' || url.username || url.password || url.port || (url.pathname && url.pathname !== '/') || url.hash) throw Error('Expected an otpauth-migration://offline URL');
  // Preserve literal + in base64; URLSearchParams would replace it with a space.
  const entries = url.search.slice(1).split('&').filter(p => p.startsWith('data='));
  if (entries.length !== 1) throw Error('Expected exactly one data parameter');
  let b64;
  try { b64 = decodeURIComponent(entries[0].slice(5)); } catch { throw Error('Invalid URL encoding'); }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.replace(/=+$/, '').length % 4 === 1) throw Error('Invalid base64 payload');
  let raw;
  try { raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch { throw Error('Invalid base64 payload'); }
  const f = fields(raw), entriesOtp = f.get(1) || [];
  if (!entriesOtp.length || entriesOtp.length > 500) throw Error('Expected 1–500 accounts');
  // Version is envelope metadata, not an OTP algorithm discriminator.
  // Validate its wire type/range without rejecting compatible account fields.
  const version = one(f, 2, 0, 0n);
  if (version > 2147483647n) throw Error('Invalid migration version metadata');
  // Proto3 omits zero-valued metadata. Zero/absent size denotes an unbatched export.
  const batchSize = Number(one(f, 3, 0, 0n)) || 1, batchIndex = Number(one(f, 4, 0, 0n));
  if (batchSize < 1 || batchSize > 500 || batchIndex < 0 || batchIndex >= batchSize) throw Error('Invalid migration batch');
  const accounts = entriesOtp.map(entry => {
    if (entry.wire !== 2) throw Error('Invalid account wire type');
    const a = fields(entry.value), secret = one(a, 1, 2, new Uint8Array());
    if (!secret.length || secret.length > 1024) throw Error('Invalid OTP secret length');
    const name = utf8.decode(one(a, 2, 2, new Uint8Array()));
    const issuer = utf8.decode(one(a, 3, 2, new Uint8Array()));
    if (name.length + issuer.length > 1024) throw Error('OTP label too long');
    const algorithm = {1:'SHA1', 2:'SHA256', 3:'SHA512'}[String(one(a, 4, 0, 0n))];
    const digits = {1:'6', 2:'8'}[String(one(a, 5, 0, 0n))];
    const type = {1:'hotp', 2:'totp'}[String(one(a, 6, 0, 0n))];
    if (!algorithm || !digits || !type) throw Error('Unknown/unspecified OTP algorithm, digits or type (MD5 is not supported)');
    const label = issuer ? `${issuer}:${name}` : name;
    const params = new URLSearchParams({secret: base32(secret), algorithm, digits});
    if (issuer) params.set('issuer', issuer);
    if (type === 'hotp') {
      const counter = one(a, 7, 0, 0n);
      if (counter > 9223372036854775807n) throw Error('Invalid HOTP counter');
      params.set('counter', String(counter));
    }
    return {name, issuer, label, type, algorithm, digits, url:`otpauth://${type}/${encodeURIComponent(label)}?${params}`};
  });
  return {accounts, batchSize, batchIndex, batchId:String(one(f, 5, 0, 0n))};
}
export function decodeAll(inputs) {
  if (!inputs.length || inputs.length > 500) throw Error('Expected 1–500 export QR codes');
  const batches = inputs.map(decodeMigration), groups = new Map();
  for (const b of batches) {
    if (b.batchSize === 1) continue;
    const group = groups.get(b.batchId) || {size:b.batchSize, indexes:new Set()};
    if (group.size !== b.batchSize || group.indexes.has(b.batchIndex)) throw Error('Inconsistent or duplicate migration batch');
    group.indexes.add(b.batchIndex); groups.set(b.batchId, group);
  }
  for (const g of groups.values()) if (g.indexes.size !== g.size) throw Error(`Incomplete export: received ${g.indexes.size} of ${g.size} QR codes`);
  const accounts = batches.flatMap(b => b.accounts);
  if (accounts.length > 500) throw Error('Maximum 500 accounts per session');
  return accounts;
}
