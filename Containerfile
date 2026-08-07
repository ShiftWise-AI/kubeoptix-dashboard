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
ENV PORT=8080

RUN dnf -y update && \
    dnf -y install nodejs npm && \
    npm install -g serve@14 && \
    useradd -u 1001 -g 0 -m -s /sbin/nologin kubeoptix && \
    dnf clean all && \
    mkdir -p /opt/app-root/src/dist /opt/app-root/src/.cache && \
    chown -R kubeoptix:0 /opt/app-root/src && \
    chgrp -R 0 /opt/app-root/src /tmp && \
    chmod -R g=u /opt/app-root/src /tmp

COPY --from=build /opt/app-root/src/dist ./dist

EXPOSE 8080

USER kubeoptix

CMD ["serve", "-s", "dist", "-l", "8080"]



