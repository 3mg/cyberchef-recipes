# Native Google Authenticator operations

This overlay adds a **Google Authenticator** category immediately below **Favourites** in CyberChef's left Operations list:

- **Google Authenticator to otpauth** — every account as an individual URL.
- **Google Authenticator to QR** — one account as a QR; **Account number** starts at **1**.

Click or drag an operation into Recipe. Paste migration URLs into Input, one per line; include every QR from a multi-QR export. For an image, first add CyberChef's built-in **Parse QR Code**, then the desired Google Authenticator operation. A screenshot containing multiple QR codes must be split into separate images first.

The conversion is browser-local and uses the bounded parser from the homelab converter. It validates OTP enums, protobuf wire types/lengths, account limits and batch completeness, and preserves 64-bit HOTP counters with BigInt. It adds no npm dependencies. The QR operation uses CyberChef's existing QR encoder and presentation code, with correct slicing of PNG Buffer views in Node tests.

## Build

Requirements: Git and Docker; allow 12 GiB RAM for a production build. Node is supplied by a digest-pinned build-only container.

```sh
sh cyberchef/build.sh
docker run --rm -p 127.0.0.1:8100:80 homelab/cyberchef:10.22.1-gauth-2
```

Base source: CyberChef 10.22.1, commit `9b2868a17866e7569726edd2cee61c4e9149344d`. The overlay installer is idempotent and rejects other application versions. Build output includes the normal downloadable standalone CyberChef archive. Upstream dependencies/runtime are kept at the installed baseline; this change is not an upstream security upgrade.

`test-installed.mjs` tests the actual installed operation classes: text conversion, QR round trip, account selection and invalid indexes, complete/incomplete batches, unknown enums, compatible version metadata, large HOTP counters and category registration. The normal repository recipe tests remain independent.

For an existing checkout, copy `cyberchef/` into it and run `node cyberchef/install.mjs /path/to/CyberChef`, then regenerate CyberChef's operation config/modules and build. New operation metadata and category entries are compiled into the application; no browser extension or local-storage import is required.

The runtime adds content revisions to the main JavaScript/CSS URLs and serves static files with `Cache-Control: no-cache` so browsers revalidate them after an update. If an already-open tab still shows **465** operations without the new category, reload it without cache or open `/?build=gauth-2`; the custom build shows **467**. Saved recipes and favourites do not need to be reset.

## Updating and rollback

This is a custom CyberChef build. Keep its image available locally or distribute it through your own registry. Rebuild/retest the overlay when updating the upstream version; installing a stock upstream image removes the added category. Keep the original image/container and the service configuration until the replacement is verified.

The included deployment utility runs inside the NOMAD admin container (which already has Docker and database access), verifies the new image is available locally, saves the old service/container configuration in NOMAD storage, and preserves the old stopped container for rollback. It updates only the CyberChef service's image and source link; user recipes remain browser-local on the same origin. It does not print credentials or read user input.

On the NOMAD host, after loading the built image:

```sh
docker exec -i -w /app nomad_admin node --input-type=module - deploy homelab/cyberchef:10.22.1-gauth-2 < cyberchef/deploy-nomad.mjs
# Use the backupId printed by the successful deployment:
docker exec -i -w /app nomad_admin node --input-type=module - rollback BACKUP_ID < cyberchef/deploy-nomad.mjs
```

The original container keeps its files and image. No data volumes are accepted by this deployment helper; it deliberately refuses a non-static CyberChef container so that such an installation can be reviewed separately.

Disable **Options → Update the URL** before entering real 2FA secrets. This is an existing CyberChef UI setting; these operations do not change personal browser settings.

## Licenses

The added operations and installer are MIT licensed under the repository license. The adapted migration parser retains `itamaker/gauth2apple` attribution and its MIT license in `lib/LICENSE.gauth2apple`. CyberChef and its generated build retain the upstream Apache-2.0 license and dependency notices.
