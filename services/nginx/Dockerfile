FROM ficusio/openresty:latest

COPY ./init.sh /usr/src/init.sh

VOLUME /var/www
VOLUME /var/log/nginx

EXPOSE 8080

CMD /usr/src/init.sh && nginx -g 'daemon off;'
