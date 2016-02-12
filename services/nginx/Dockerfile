FROM nginx:latest

COPY ./init.sh /usr/src/init.sh

COPY ./config/nginx.conf /etc/nginx/nginx.conf
COPY ./config/template.d /etc/nginx/template.d

VOLUME /var/www
VOLUME /var/log/nginx

EXPOSE 8080

CMD /usr/src/init.sh && nginx -g 'daemon off;'
