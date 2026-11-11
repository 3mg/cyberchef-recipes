#!/bin/sh
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
checkout_dir=${1:-"$repo_dir/.cache/CyberChef-10.22.1"}
if [ ! -d "$checkout_dir/.git" ]; then
  git clone --depth 1 --branch v10.22.1 https://github.com/gchq/CyberChef.git "$checkout_dir"
fi
test "$(git -C "$checkout_dir" rev-parse HEAD)" = 9b2868a17866e7569726edd2cee61c4e9149344d
checkout_dir=$(CDPATH= cd -- "$checkout_dir" && pwd)
mkdir -p "$checkout_dir/cyberchef"
cp -R "$repo_dir/cyberchef/." "$checkout_dir/cyberchef/"
docker run --rm --cpus 4 --memory 12g \
  -e NODE_OPTIONS=--max-old-space-size=8192 \
  -v "$checkout_dir:/app" -w /app \
  node@sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e \
  sh -ec 'npm ci --ignore-scripts --no-audit --no-fund
    npm run postinstall
    node cyberchef/install.mjs .
    node --no-warnings --no-experimental-fetch cyberchef/test-installed.mjs .
    npx grunt clean:prod clean:config exec:generateConfig findModules webpack:web copy:standalone zip:standalone clean:standalone exec:calcDownloadHash chmod --msg=Homelab-Google-Authenticator'
# Upstream .dockerignore excludes build/, so package from a dedicated context.
runtime_dir="$checkout_dir/.homelab-runtime"
mkdir -p "$runtime_dir/build"
cp -R "$checkout_dir/build/prod" "$runtime_dir/build/"
cp "$repo_dir/cyberchef/nginx.conf" "$runtime_dir/nginx.conf"
docker build -f "$repo_dir/cyberchef/Dockerfile" -t homelab/cyberchef:10.22.1-gauth-2 "$runtime_dir"
