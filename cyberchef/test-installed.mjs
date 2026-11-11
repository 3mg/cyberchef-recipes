import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const target=resolve(process.argv[2]||'.');
const require=createRequire(target+'/package.json');
const qrImage=require('qr-image');
const {default:Jimp}=await import(pathToFileURL(target+'/node_modules/jimp/es/index.js'));
const {default:Urls}=await import(pathToFileURL(target+'/src/core/operations/GoogleAuthenticatorToOtpauth.mjs'));
const {default:Qr}=await import(pathToFileURL(target+'/src/core/operations/GoogleAuthenticatorToQR.mjs'));
const {default:Chef}=await import(pathToFileURL(target+'/src/core/Chef.mjs'));
const {parseQrCode}=await import(pathToFileURL(target+'/src/core/lib/QRCode.mjs'));
const vi=n=>{n=BigInt(n);const a=[];do{const b=Number(n&127n);n>>=7n;a.push(b|(n?128:0));}while(n);return Buffer.from(a);};
const f=(n,v)=>typeof v==='number'||typeof v==='bigint'?Buffer.concat([vi(n*8),vi(v)]):Buffer.concat([vi(n*8+2),vi(Buffer.byteLength(v)),Buffer.from(v)]);
function input({version=2,batchSize=0,index=0,algorithm=1,type=2,counter=0n,namePrefix=''}={}) {
    const account=name=>Buffer.concat([f(1,'12345678901234567890'),f(2,namePrefix+name),f(3,'Demo'),f(4,algorithm),f(5,1),f(6,type),f(7,counter)]);
    const payload=Buffer.concat([f(1,account('first')),f(1,account('second')),f(2,version),f(3,batchSize),f(4,index),f(5,42)]);
    return 'otpauth-migration://offline?data='+encodeURIComponent(payload.toString('base64'));
}
const bytes=value=>{const b=Buffer.from(value);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const image=value=>qrImage.imageSync(value,{type:'png',size:5,margin:4,ec_level:'M'});
const bundle=entries=>bytes(JSON.stringify({type:'cyberchef-google-authenticator-inputs-v1',inputs:entries.map(data=>typeof data==='string'?{encoding:'text',data}:{encoding:'base64',data:Buffer.from(data).toString('base64')})}));
const op=new Urls(),qr=new Qr();
const urls=(await op.run(bytes(input()))).split('\n');
assert.equal(urls.length,2);
assert.equal(new URL(urls[0]).searchParams.get('secret'),'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
assert.equal(decodeURIComponent(new URL(urls[1]).pathname),'/Demo:second');
const args=[2,'PNG',6,4,'Medium'];
const png=await qr.run(bytes(input()),args);
assert.equal(await parseQrCode(Buffer.from(png),false),urls[1]);
assert.match(qr.present(png,args),/<img src="data:image\/png;base64,/);
await assert.rejects(qr.run(bytes(input()),[0,...args.slice(1)]),/Account number/);
await assert.rejects(qr.run(bytes(input()),[3,...args.slice(1)]),/Account number/);
await assert.rejects(op.run(bytes(input({algorithm:99}))),/algorithm/i);
await assert.rejects(op.run(bytes(input({batchSize:2}))),/Incomplete/i);
assert.equal((await op.run(bytes(input({batchSize:2,index:0})+'\n'+input({batchSize:2,index:1})))).split('\n').length,4);
assert.equal(new URL((await op.run(bytes(input({type:1,counter:9007199254740993n})))).split('\n')[0]).searchParams.get('counter'),'9007199254740993');

// RFC test secret only. Canonicalizing an already-standard QR preserves OTP parameters.
const standard='otpauth://totp/Example%3Aalice?secret=gezdgnbvgy3tqojqgezdgnbvgy3tqojq&issuer=example.com&algorithm=SHA256&digits=8&period=60';
const canonical=await op.run(bytes(standard));
const standardUrl=new URL(canonical);
assert.equal(standardUrl.searchParams.get('secret'),'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
assert.equal(standardUrl.searchParams.get('algorithm'),'SHA256');
assert.equal(standardUrl.searchParams.get('digits'),'8');
assert.equal(standardUrl.searchParams.get('period'),'60');
assert.equal(standardUrl.searchParams.get('issuer'),'example.com');
assert.equal(decodeURIComponent(standardUrl.pathname),'/Example:alice');
assert.equal(new URL(await op.run(bytes('OTPAUTH://TOTP/alice?secret=MY'))).hostname,'totp');
const spaced=await op.run(bytes('otpauth://totp/alice?secret=MY%3D%3D%3D%3D%3D%3D&issuer=A%2BB%20C'));
assert.equal(new URL(spaced).searchParams.get('secret'),'MY');
assert.match(spaced,/issuer=A%2BB%20C/);
const hotp=new URL(await op.run(bytes('otpauth://hotp/Demo%3Aalice?secret=MY&counter=9007199254740993&issuer=Demo')));
assert.equal(hotp.searchParams.get('counter'),'9007199254740993');
assert.equal(decodeURIComponent(hotp.pathname),'/Demo:alice');
for(const invalid of [
    standard+'&secret=MY', standard+'&period=30', standard+'&encoder=steam',
    'otpauth://totp/alice?secret=MY&algorithm=', 'otpauth://totp/alice?secret=MY&digits=',
    'otpauth://totp/alice?secret=MY&period=',
    'otpauth://totp/alice?secret=MZ', 'otpauth://totp/alice?secret=MY&algorithm=MD5',
    'https://example.test/?secret=PRIVATE_SENTINEL'
]) {
    await assert.rejects(op.run(bytes(invalid)),error=>!error.message.includes('PRIVATE_SENTINEL')&&!error.message.includes('gezdgnbv'));
}
const standardPng=image(standard),migrationPng=image(input());
const oversized=Buffer.from(standardPng);
oversized.writeUInt32BE(100000,16);
await assert.rejects(op.run(bytes(oversized)),/megapixels/i);
const duplicateHeader=Buffer.concat([standardPng.subarray(0,33),standardPng.subarray(8,33),standardPng.subarray(33)]);
await assert.rejects(op.run(bytes(duplicateHeader)),/duplicate PNG/i);
assert.equal(await op.run(bytes(standardPng)),canonical);
assert.equal(await op.run(bytes(migrationPng)),urls.join('\n'));
const jpeg=await (await Jimp.read(standardPng)).quality(95).getBufferAsync(Jimp.MIME_JPEG);
assert.equal(await op.run(bytes(jpeg)),canonical);
const standardQr=await qr.run(bytes(standardPng),[1,'PNG',5,4,'Medium']);
assert.equal(await parseQrCode(Buffer.from(standardQr),false),canonical);

// All input images must reach the parser together, preserving batch validation.
const first=image(input({batchSize:2,index:0,namePrefix:'part1-'}));
const second=image(input({batchSize:2,index:1,namePrefix:'part2-'}));
const combined=await op.run(bundle([first,second]));
assert.equal(combined.split('\n').length,4);
assert.match(decodeURIComponent(new URL(combined.split('\n')[3]).pathname),/part2-second/);
await assert.rejects(op.run(bundle([first])),/Incomplete/i);
await assert.rejects(op.run(bundle([first,first])),/duplicate|inconsistent/i);
const compositeFirst=await Jimp.read(first),compositeSecond=await Jimp.read(second);
const composite=new Jimp(compositeFirst.bitmap.width+compositeSecond.bitmap.width+30,Math.max(compositeFirst.bitmap.height,compositeSecond.bitmap.height),0xffffffff);
composite.composite(compositeFirst,0,0).composite(compositeSecond,compositeFirst.bitmap.width+30,0);
const compositePng=await composite.getBufferAsync(Jimp.MIME_PNG);
assert.equal((await op.run(bytes(compositePng))).split('\n').length,4);
const batchQr=await qr.run(bundle([first,second]),[4,'PNG',5,4,'Medium']);
assert.equal(await parseQrCode(Buffer.from(batchQr),false),combined.split('\n')[3]);

// Real Chef pipelines exercise Dish type conversion and asynchronous operations.
for(const recipe of [
    [{op:op.name,args:[]}],
    [{op:'Parse QR Code',args:[false]},{op:op.name,args:[]}]
]) {
    const result=await new Chef().bake(bytes(standardPng),recipe,{returnType:'string'});
    assert.equal(result.error,false);
    assert.equal(result.result,canonical);
}
const qrResult=await new Chef().bake(bytes(standardPng),[{op:qr.name,args:[1,'PNG',5,4,'Medium']}]);
assert.equal(qrResult.error,false);
assert.match(qrResult.result,/<img src="data:image\/png;base64,/);
const batchResult=await new Chef().bake(bundle([first,second]),[{op:op.name,args:[]}],{returnType:'string'});
assert.equal(batchResult.error,false);
assert.equal(batchResult.result,combined);
const categories=JSON.parse(readFileSync(target+'/src/core/config/Categories.json'));
assert.deepEqual(categories[1],{name:'Google Authenticator',ops:[op.name,qr.name]});
if(process.env.GAUTH_FIXTURES_DIR) {
    const dir=process.env.GAUTH_FIXTURES_DIR;
    mkdirSync(dir,{recursive:true});
    for(const [name,data] of Object.entries({'standard.png':standardPng,'standard.jpg':jpeg,'migration.png':migrationPng,'batch-1.png':first,'batch-2.png':second,'batch-composite.png':compositePng,'standard-canonical.txt':canonical,'batch-expected.txt':combined}))writeFileSync(dir+'/'+name,data);
}
console.log('Native operations: direct PNG/JPEG, standard OTP normalization without semantic changes, full Chef pipelines, multi-image/composite QR batches, malformed input rejection, QR round trips, 64-bit HOTP and category registration passed.');
