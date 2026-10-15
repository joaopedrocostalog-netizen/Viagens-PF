FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node api/*.mjs ./api/
COPY --chown=node:node index.html styles.css logo-costalog-sem-fundo-1024x876.png ./
COPY --chown=node:node src/*.js src/*.mjs ./src/
USER node
EXPOSE 3001
CMD ["node", "api/server.mjs"]
