FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "echo 'CONTAINER_START' && npx prisma migrate deploy; echo \"MIGRATE_EXIT_$?\" && npm start"]
