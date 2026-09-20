FROM registry.access.redhat.com/ubi10:1785332448 AS build

USER 0
WORKDIR /opt/app-root/src

RUN dnf -y update && \
    dnf -y install nodejs npm && \
    dnf clean all

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM registry.access.redhat.com/ubi10:1785332448 AS runtime

USER 0
WORKDIR /opt/app-root/src

ENV NODE_ENV=production

RUN dnf -y update && \
    dnf -y install nodejs npm && \
    useradd -u 1001 -g 0 -m -s /sbin/nologin kubeoptix && \
    dnf clean all && \
    mkdir -p /opt/app-root/src/dist /opt/app-root/src/.cache && \
    chown -R kubeoptix:0 /opt/app-root/src && \
    chgrp -R 0 /opt/app-root/src /tmp && \
    chmod -R g=u /opt/app-root/src /tmp

COPY --from=build /opt/app-root/src/dist ./dist
COPY server.mjs ./server.mjs
COPY server ./server

EXPOSE 8080

USER kubeoptix

CMD ["node", "server.mjs"]


