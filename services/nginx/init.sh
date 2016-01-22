#!/bin/sh

echo "Copying nginx configuration"
rm -rf /etc/nginx/conf.d
mkdir -p /etc/nginx/conf.d
cp -r /etc/nginx/template.d/* /etc/nginx/conf.d
sed -i 's/\$HOST/'$HOST'/g' /etc/nginx/conf.d/*.conf

nginx -g 'daemon off;'
