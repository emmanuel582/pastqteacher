FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3002 TEACHER_DATA_DIR=/var/lib/pastq-teacher
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /var/lib/pastq-teacher && chown node:node /var/lib/pastq-teacher
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3002
CMD ["node", "server/index.js"]
