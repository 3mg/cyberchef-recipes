# Keep the installed upstream runtime; replace only its static application.
FROM ghcr.io/gchq/cyberchef@sha256:7c743898296b9b1de2cc7d55779980dcb665a1a6fc32fa45704752132041ef90
RUN rm -rf /usr/share/nginx/html/*
COPY build/prod/ /usr/share/nginx/html/
LABEL org.opencontainers.image.title="CyberChef with Google Authenticator operations" \
      org.opencontainers.image.source="https://github.com/3mg/cyberchef-recipes" \
      org.opencontainers.image.version="10.22.1-gauth-1"
