# Google Authenticator → Apple Passwords: CyberChef recipes

Convert Google Authenticator `otpauth-migration://offline?data=…` exports to individual standard `otpauth://` URLs or QR codes. Uses stock CyberChef operations; no custom plugin, server processing or external request is needed.

## Use

1. In Google Authenticator, choose **Transfer accounts → Export accounts**.
2. Get the text inside each export QR using an offline QR reader. Paste **all** URLs from one export into CyberChef Input, one per line. Do not send them to an online QR reader.
3. **Load recipe** → paste the contents of one of these files → **Load**:
   - [`google-authenticator-to-otpauth.json`](recipes/google-authenticator-to-otpauth.json): all account URLs, one per line.
   - [`google-authenticator-to-qr.json`](recipes/google-authenticator-to-qr.json): a QR for one account. Change `$accountIndex := 0` in the **second Jsonata Query** to `1`, `2`, etc. for the next accounts.
4. Scan each resulting QR with the iPhone Camera and open it in Passwords. Verify codes match before deleting the originals.

For a single export screenshot, you can prepend **Parse QR Code** to either recipe and open the image as Input. For exports with multiple QR codes, extract and combine all URLs before using the recipe; incomplete batches are rejected.

Use a trusted local/offline CyberChef installation. In CyberChef Options, disable updating the URL with the input **before** pasting real secrets: default CyberChef settings can put Input into the browser URL fragment and history. Do not save or share links containing input, screenshots, or output QR codes. Clear Input/Output and close the tab afterward. The recipe contains no real credentials; [`test/example.txt`](test/example.txt) uses the public RFC test secret `12345678901234567890`.

## Compatibility and limits

Verified in CyberChef **10.22.1** in a browser. Supports SHA1/SHA256/SHA512, 6/8 digits, TOTP and HOTP, binary secrets and UTF-8 labels. Apple Passwords may not support every OTP variant. MD5, unspecified/unknown parameters, empty secrets, incomplete or duplicate multi-QR batches, and more than 500 accounts are rejected.

CyberChef's Protobuf Decode converts 64-bit integers to JavaScript numbers. Consequently HOTP counters above `9007199254740991` are rejected to avoid silent corruption. This recipe is for your own Authenticator exports, not a hardened parser for arbitrary hostile protobuf files; CyberChef's decoding happens before the recipe's validation.

Envelope `version` is validated as non-negative int32 metadata, not restricted to `1`: conversion validates the actual OTP fields. Zero/omitted batch size is treated as an unbatched export (index must still be zero); positive multi-QR sizes retain completeness checks. This permits structurally compatible exports without claiming that every future schema is supported.

Base32 conversion is implemented directly in JSONata without `$base64decode`, avoiding UTF-8 corruption and the older CyberChef Web Worker base64 helper bug. The `.proto` schema uses numeric OTP enums so unknown values can be rejected. Protobuf field names become camelCase in CyberChef's JSON output.

## Build and test

```sh
npm ci --ignore-scripts
npm run build
npm test
npm audit
```

`src/migration.proto` and `src/convert.jsonata` are embedded into the importable JSON recipes. Development dependencies are pinned to patched versions; deploying the JSON does not install any packages into CyberChef. Tests cover binary Base32, algorithms, labels, batches, invalid input and counter limits. Browser verification covers the actual CyberChef pipeline as well.

## Self-host the recipe catalogue

`site/` is a static catalogue with links that open recipes in the adjacent CyberChef instance on port 8100. The links contain the recipe only, never an input secret. Customize `src/catalogue.mjs` if your CyberChef uses another port.

```sh
CYBERCHEF_URL=http://nomad.home.arpa:8100/ npm run build
NOMAD_LAN_IP=192.168.1.230 docker compose -f deploy/compose.yml up -d
```

The catalogue is available on port 8101. This is a separate static container with a read-only bind mount and survives recreation of the CyberChef container. It does not modify CyberChef, its database, or personal saved recipes. `NOMAD_LAN_IP` should be a trusted LAN address; no router/public exposure is required.

## Attribution

Inspired by [itamaker/gauth2apple](https://github.com/itamaker/gauth2apple), reviewed at commit `97eda36bab976f2bbe0488312764c01e190229d6`. CyberChef is developed by [GCHQ](https://github.com/gchq/CyberChef). This repository contains independently written recipes, not a CyberChef fork. MIT license.
