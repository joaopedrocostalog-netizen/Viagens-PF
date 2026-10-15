FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node api/*.mjs ./api/
USER node
EXPOSE 3001
CMD ["node", "api/server.mjs"]
