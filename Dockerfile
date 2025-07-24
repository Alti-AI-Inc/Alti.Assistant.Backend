FROM node:20

WORKDIR /app/ason-core-service

COPY package*.json ./

RUN yarn install --frozen-lockfile

RUN yarn global add nodemon

COPY . .

EXPOSE 5100

CMD ["nodemon", "index.js"]