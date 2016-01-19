FROM node:4

ENV NODE_ENV=production

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json .
RUN npm install

COPY . .

RUN npm run-script postinstall --unsafe-perm

VOLUME /opt/ssl/cert.pem /opt/ssl/key.pem /var/sites

EXPOSE 80
EXPOSE 443

ENV HOST=localhost
ENV PORT=80
ENV HTTPS=false
ENV HTTPS_PORT=443
ENV HTTPS_CERT=/opt/ssl/cert.pem
ENV HTTPS_KEY=/opt/ssl/key.pem
ENV MONGODB_URL=
ENV REDIS_URL=
ENV NEW_RELIC_LICENSE_KEY=
ENV DROPBOX_APP_KEY=
ENV DROPBOX_APP_SECRET=
ENV DROPBOX_OAUTH2_LOGIN_CALLBACK=https://my.localhost/login/dropbox/oauth2/callback
ENV DROPBOX_OAUTH2_DEMO_LOGIN_CALLBACK=https://try.localhost/login/dropbox/oauth2/callback
ENV AWS_S3_BUCKET=
ENV AWS_ACCESS_KEY_ID=
ENV AWS_SECRET_ACCESS_KEY=
ENV GOOGLE=false
ENV LOCAL=false
ENV LOCAL_NAME=Filecanvas\ server
ENV LOCAL_LABEL=Filecanvas\ server
ENV LOCAL_SITE_ROOT=/var/sites
ENV LOCAL_BCRYPT_STRENGTH=10
ENV COOKIE_SECRET=
ENV WWW_ROOT=
ENV ASSETS_ROOT=
ENV ADMIN_ROOT=
ENV THEMES_ROOT=
ENV SITE_USER_BCRYPT_STRENGTH=10
ENV SESSION_DURATION=3600

CMD ["npm", "start"]
