FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Keep empty for same-origin /api and /auth
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine
COPY dist /usr/share/nginx/html