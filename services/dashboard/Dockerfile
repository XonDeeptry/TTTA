FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Container chỉ chạy MỘT lần lúc `docker compose up` để copy dist/ vào volume dùng chung với
# Caddy rồi thoát — không cần Node/nginx chạy nền, Caddy tự serve file tĩnh (mục 3.2: dashboard
# là SPA tĩnh, Caddy serve).
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["sh", "-c", "cp -r dist/* /srv/dashboard/ && echo 'dashboard build copied to /srv/dashboard'"]
