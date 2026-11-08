FROM nginx:1.31.7-alpine@sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d
RUN apk upgrade --no-cache \
    && chown -R nginx:nginx /var/cache/nginx \
    && sed -i 's|^pid .*;|pid /tmp/nginx.pid;|; /^user /d' /etc/nginx/nginx.conf \
    && grep -q '^pid /tmp/nginx.pid;' /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css responsive.css clean.css assistant.css app.js api.js auth.js demo.js demo-play.js demo-reception.js utils.js idempotency.js resources.js play.js reception.js app-config.json /usr/share/nginx/html/
EXPOSE 8080
COPY ui/ /usr/share/nginx/html/ui/
COPY assets/ /usr/share/nginx/html/assets/
USER 101:101
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
