FROM node:alpine

# Install git and ssh client for fetching repositories
RUN apk add --no-cache git openssh-client

RUN npm install -g pnpm yarn bun

WORKDIR /workspace
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]