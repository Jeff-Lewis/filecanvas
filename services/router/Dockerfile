FROM ficusio/openresty:latest

COPY ./plugins/lua-resty-template/lib/resty /opt/openresty/lua-resty-template/resty
COPY ./init.sh /usr/src/init.sh

VOLUME /var/log/nginx

EXPOSE 8080

CMD /usr/src/init.sh && nginx -g 'daemon off;'
