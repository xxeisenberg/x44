FROM node:alpine

# Install git and ssh client for fetching repositories
RUN apk add --no-cache git openssh-client

COPY --from=oven/bun:alpine /usr/local/bin/bun /usr/local/bin/bun

RUN corepack enable

WORKDIR /workspace
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]