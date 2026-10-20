FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=18082 \
    DATA_DIR=/data

RUN mkdir -p /data
EXPOSE 18082
CMD ["node", "--no-warnings", "src/main.ts"]
