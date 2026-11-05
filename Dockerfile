FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json *.mjs cities.json ./
COPY web ./web
COPY demo-input.json ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
