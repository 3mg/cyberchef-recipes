# Keep the installed upstream runtime; replace only its static application.
FROM ghcr.io/gchq/cyberchef@sha256:7c743898296b9b1de2cc7d55779980dcb665a1a6fc32fa45704752132041ef90
RUN rm -rf /usr/share/nginx/html/*
COPY build/prod/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Upstream uses stable entry-point names. Change their URLs when content changes,
# including for browsers that cached the original server's unversioned files.
RUN set -eu; cd /usr/share/nginx/html; \
    for asset in assets/main.js assets/main.css; do \
        revision="$(sha256sum "$asset" | cut -c1-16)"; \
        sed -i "s|$asset\"|$asset?v=$revision\"|g" index.html; \
    done; \
    rm -f index.html.gz index.html.br
LABEL org.opencontainers.image.title="CyberChef with Google Authenticator operations" \
      org.opencontainers.image.source="https://github.com/3mg/cyberchef-recipes" \
      org.opencontainers.image.version="10.22.1-gauth-3"
