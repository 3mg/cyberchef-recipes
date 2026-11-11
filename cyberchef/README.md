# Native Google Authenticator operations

This overlay adds a **Google Authenticator** category immediately below **Favourites** in CyberChef's left Operations list:

- **Google Authenticator to otpauth** — every account as an individual, normalized URL.
- **Google Authenticator to QR** — a freshly generated QR; **Account number** starts at **1** across all loaded accounts.

Put **Google Authenticator to QR** first in Recipe, then open or drop your PNG/JPEG screenshots into Input. No preceding operation is needed. For an export containing several QR images, load all of them together: the operation combines all nonempty Input tabs, validates the complete export, and shows the selected account in Output. Increase **Account number** for the next account. All tabs display the same combined selection; the input files remain unchanged. An existing **Parse QR Code → Google Authenticator** recipe is also supported.

Both operations accept ordinary `otpauth://totp/…` / `otpauth://hotp/…` accounts, Google `otpauth-migration://…` exports, text URLs on separate lines, and screenshots containing more than one QR. Standard URLs are reconstructed with canonical Base32 and URL encoding while preserving the secret, algorithm, digits, period and counter. Unsupported parameters are rejected instead of silently changing how codes are generated. A newly rendered QR can fix encoding/image compatibility; it does not make unsupported OTP variants supported by Apple Passwords.

The conversion is browser-local and uses the bounded parser from the homelab converter. It validates OTP enums, protobuf wire types/lengths, account limits and batch completeness, and preserves 64-bit HOTP counters with BigInt. Images are decoded from bytes only with CyberChef's existing Jimp/jsQR dependencies; text is never passed to a network/path image loader. Limits are 16 MiB and 16 megapixels per image, 32 MiB for the combined input envelope, and 500 accounts. It adds no npm dependencies. The QR operation uses CyberChef's existing QR encoder and presentation code, with correct slicing of PNG Buffer views in Node tests.

## Build

Requirements: Git and Docker; allow 12 GiB RAM for a production build. Node is supplied by a digest-pinned build-only container.

```sh
sh cyberchef/build.sh
docker run --rm -p 127.0.0.1:8100:80 homelab/cyberchef:10.22.1-gauth-3
```

Base source: CyberChef 10.22.1, commit `9b2868a17866e7569726edd2cee61c4e9149344d`. The overlay installer is idempotent and rejects other application versions. Build output includes the normal downloadable standalone CyberChef archive. Upstream dependencies/runtime are kept at the installed baseline; this change is not an upstream security upgrade.

`test-installed.mjs` tests the installed classes and real Chef pipelines: direct PNG/JPEG input, canonical standard OTP parameters, QR round trips, account selection, combined image exports, multi-QR screenshots, incomplete/duplicate batches, invalid parameters, large HOTP counters and category registration. `web/test-batch.mjs` checks collective-input routing and snapshot behavior. All fixtures use public RFC test secrets. The normal repository recipe tests remain independent.

For an existing checkout, copy `cyberchef/` into it and run `node cyberchef/install.mjs /path/to/CyberChef`, then regenerate CyberChef's operation config/modules and build. New operation metadata and category entries are compiled into the application; no browser extension or local-storage import is required.

The runtime adds content revisions to the main JavaScript/CSS URLs and serves static files with `Cache-Control: no-cache` so browsers revalidate them after an update. Reload an already-open tab or open `/?build=gauth-3` after upgrading. The banner says **Homelab-Google-Authenticator-v3** and the custom build shows **467** operations. Saved recipes and favourites do not need to be reset.

## Updating and rollback

This is a custom CyberChef build. Keep its image available locally or distribute it through your own registry. Rebuild/retest the overlay when updating the upstream version; installing a stock upstream image removes the added category. Keep the original image/container and the service configuration until the replacement is verified.

The included deployment utility runs inside the NOMAD admin container (which already has Docker and database access), verifies the new image is available locally, saves the old service/container configuration in NOMAD storage, and preserves the old stopped container for rollback. It updates only the CyberChef service's image and source link; user recipes remain browser-local on the same origin. It does not print credentials or read user input.

On the NOMAD host, after loading the built image:

```sh
docker exec -i -w /app nomad_admin node --input-type=module - deploy homelab/cyberchef:10.22.1-gauth-3 < cyberchef/deploy-nomad.mjs
# Use the backupId printed by the successful deployment:
docker exec -i -w /app nomad_admin node --input-type=module - rollback BACKUP_ID < cyberchef/deploy-nomad.mjs
```

The original container keeps its files and image. No data volumes are accepted by this deployment helper; it deliberately refuses a non-static CyberChef container so that such an installation can be reviewed separately.

When an enabled Google Authenticator operation is in the recipe, input is omitted from CyberChef state/share URLs automatically. This does not change your saved browser options or other recipes. For recipes without these operations, disable **Options → Update the URL** before entering real 2FA secrets.

## Licenses

The added operations and installer are MIT licensed under the repository license. The adapted migration parser retains `itamaker/gauth2apple` attribution and its MIT license in `lib/LICENSE.gauth2apple`. CyberChef and its generated build retain the upstream Apache-2.0 license and dependency notices.
