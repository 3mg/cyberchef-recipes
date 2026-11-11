import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyWebPatch} from './patch-web.mjs';
const target=resolve(process.argv[2] || '.');
const source=fileURLToPath(new URL('./',import.meta.url));
const pkg=JSON.parse(readFileSync(join(target,'package.json'),'utf8'));
if(pkg.name!=='cyberchef'||pkg.version!=='10.22.1')throw Error('Expected a CyberChef 10.22.1 checkout');
for(const name of ['GoogleAuthenticatorToOtpauth.mjs','GoogleAuthenticatorToQR.mjs'])copyFileSync(join(source,'operations',name),join(target,'src/core/operations',name));
copyFileSync(join(source,'lib/GoogleAuthenticatorMigration.mjs'),join(target,'src/core/lib/GoogleAuthenticatorMigration.mjs'));
copyFileSync(join(source,'lib/GoogleAuthenticatorInput.mjs'),join(target,'src/core/lib/GoogleAuthenticatorInput.mjs'));
copyFileSync(join(source,'lib/LICENSE.gauth2apple'),join(target,'src/core/lib/LICENSE.gauth2apple'));
const path=join(target,'src/core/config/Categories.json');
const categories=JSON.parse(readFileSync(path,'utf8')).filter(c=>c.name!=='Google Authenticator');
categories.splice(1,0,{name:'Google Authenticator',ops:['Google Authenticator to otpauth','Google Authenticator to QR']});
writeFileSync(path,JSON.stringify(categories,null,4)+'\n');
applyWebPatch(target);
// Runtime nginx revalidates the uncompressed assets. Keep optional Brotli files
// usable without spending several minutes recompressing every unchanged module.
const webpackPath=join(target,'webpack.config.js');
const webpackSource=readFileSync(webpackPath,'utf8');
if (!webpackSource.includes('[zlib.constants.BROTLI_PARAM_QUALITY]: 11') && !webpackSource.includes('[zlib.constants.BROTLI_PARAM_QUALITY]: 5')) throw Error('Unexpected Brotli build configuration');
writeFileSync(webpackPath,webpackSource.replace('[zlib.constants.BROTLI_PARAM_QUALITY]: 11','[zlib.constants.BROTLI_PARAM_QUALITY]: 5'));
console.log('Installed two native operations in the Google Authenticator category.');
