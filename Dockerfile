# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web-build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM mcr.microsoft.com/playwright:v1.61.0-noble AS api
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4100
ENV UPLOAD_DIR=/app/uploads
ENV CHROME_PATH=/usr/bin/google-chrome

COPY package*.json ./
RUN npm ci --omit=dev \
  && npx playwright install chrome

COPY server ./server
COPY shared ./shared
COPY tsconfig.json ./

RUN mkdir -p /app/uploads /app/browser-data

EXPOSE 4100
CMD ["xvfb-run", "-a", "npm", "run", "start"]
