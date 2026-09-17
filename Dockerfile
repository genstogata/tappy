# syntax=docker/dockerfile:1
#
# Tappy — Hallway Pass Tracker
#
# A static site, so there is no build stage: the image is nginx plus the files
# the browser needs. The container holds no data and needs no volume — every
# class, roster and session lives in the browser on the teacher's device.

FROM nginxinc/nginx-unprivileged:1.29-alpine

LABEL org.opencontainers.image.title="Tappy" \
      org.opencontainers.image.description="Offline-first hallway pass tracker. Static files only — no database, no server-side data, no writable volume." \
      org.opencontainers.image.url="https://github.com/genstogata/tappy" \
      org.opencontainers.image.source="https://github.com/genstogata/tappy" \
      org.opencontainers.image.documentation="https://github.com/genstogata/tappy/blob/main/docker/README.md" \
      org.opencontainers.image.licenses="GPL-3.0-or-later"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Only the files the browser actually needs. LICENSE is included because the
# image redistributes the program.
COPY index.html app.js db.js styles.css service-worker.js manifest.json LICENSE /usr/share/nginx/html/
COPY icons/ /usr/share/nginx/html/icons/
COPY sample-data/ /usr/share/nginx/html/sample-data/

# Normalise permissions. COPY preserves the source file modes, so a file that
# happens to be 0600 on the build machine (e.g. after an editor or script
# rewrote it) would be unreadable to the unprivileged nginx user (uid 101) and
# serve 403 Forbidden. Force world-readable files and traversable directories.
#
# This must run as root: the base image's default user (101) does not own the
# copied files and cannot chmod them. The final USER restores the unprivileged
# user so the running container is still hardened.
USER root
RUN apk upgrade --no-cache \
  && chmod -R a+rX /usr/share/nginx/html
USER 101

EXPOSE 8080

# busybox wget ships with Alpine, so no extra packages are needed.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
