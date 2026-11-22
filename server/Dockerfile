FROM node:22-alpine
WORKDIR /app
COPY adhdeer-server.js package.json ./
ENV NODE_ENV=production PORT=8787
VOLUME /app/data
EXPOSE 8787
CMD ["node", "adhdeer-server.js"]
