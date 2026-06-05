FROM node:18-alpine

# Install git and ssh client for fetching repositories
RUN apk add --no-cache git openssh-client

WORKDIR /workspace
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]