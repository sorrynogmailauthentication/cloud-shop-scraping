# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Nginx runtime with baked frontend
FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html