FROM node:4

ENV NODE_ENV=production

RUN mkdir -p /var/app
WORKDIR /var/app

COPY package.json .
RUN npm install

COPY . .

VOLUME \
	/opt/ssl/cert.pem /opt/ssl/key.pem\
	/var/sites\
	/var/log/nodejs

EXPOSE \
	80\
	443

ENV \
	HOST=localhost\
	PORT=80\
	HTTPS=false\
	HTTPS_PORT=443\
	HTTPS_CERT=/opt/ssl/cert.pem\
	HTTPS_KEY=/opt/ssl/key.pem\
	MONGODB_URL=\
	REDIS_URL=\
	NEW_RELIC_LICENSE_KEY=\
	DROPBOX_APP_KEY=\
	DROPBOX_APP_SECRET=\
	DROPBOX_OAUTH2_LOGIN_CALLBACK=\
	DROPBOX_OAUTH2_DEMO_LOGIN_CALLBACK=\
	AWS_S3_BUCKET=\
	AWS_ACCESS_KEY_ID=\
	AWS_SECRET_ACCESS_KEY=\
	GOOGLE=false\
	LOCAL=false\
	LOCAL_NAME=Filecanvas\ server\
	LOCAL_LABEL=Filecanvas\ server\
	LOCAL_SITE_ROOT=/var/sites\
	LOCAL_BCRYPT_STRENGTH=10\
	COOKIE_SECRET=\
	WWW_ROOT=\
	ASSETS_ROOT=\
	ADMIN_ROOT=\
	THEMES_ROOT=\
	SITE_USER_BCRYPT_STRENGTH=10\
	SESSION_DURATION=3600

CMD /bin/bash -c "npm start > >(tee /var/log/nodejs/nodejs.log) 2> >(tee /var/log/nodejs/nodejs-error.log >&2)"
