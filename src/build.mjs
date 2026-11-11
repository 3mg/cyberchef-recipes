import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const schema=readFileSync(new URL('./migration.proto',import.meta.url),'utf8');
const query=readFileSync(new URL('./convert.jsonata',import.meta.url),'utf8');
const replace=(find,replacement)=>({op:'Find / Replace',args:[{option:'Regex',string:find},replacement,true,false,false,false]});
const common=[
  replace('^\\s+|\\s+$',''),
  {op:'Fork',args:['\\n',',',false]},
  replace('^\\s+|\\s+$',''),
  replace('^otpauth-migration://offline\\?data=([A-Za-z0-9%+/=]+)$','$1'),
  {op:'URL Decode',args:[false]},
  {op:'From Base64',args:['A-Za-z0-9+/=',false,true]},
  {op:'Protobuf Decode',args:[schema,false,false]},
  {op:'Merge',args:[false]},
  replace('^([\\s\\S]*)$','[$1]'),
  {op:'Jsonata Query',args:[query]}
];
const unwrap=[replace('^"|"$',''),{op:'Unescape string',args:[]}];
const recipes={
  'google-authenticator-to-otpauth': [...common,{op:'Jsonata Query',args:['$join($, "\\n")']},...unwrap],
  'google-authenticator-to-qr': [...common,{op:'Jsonata Query',args:['($accountIndex := 0; $assert($accountIndex >= 0 and $accountIndex < $count($), "Account index out of range"); $[$accountIndex])']},...unwrap,{op:'Generate QR Code',args:['PNG',6,4,'Medium']}]
};
mkdirSync(new URL('../recipes/',import.meta.url),{recursive:true});
for(const [name,recipe] of Object.entries(recipes))writeFileSync(new URL(`../recipes/${name}.json`,import.meta.url),JSON.stringify(recipe,null,2)+'\n');
await import('./catalogue.mjs');
