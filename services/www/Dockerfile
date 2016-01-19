FROM node:4

ENV NODE_ENV=production

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json .
RUN npm install

COPY . .

VOLUME /var/templates/www /var/www

ENV HOST=
ENV HOST_PROTOCOL=
ENV HOST_PORT=
ENV TEMPLATE_DIR=/var/templates/www
ENV OUTPUT_DIR=/var/www

CMD ["./build"]
