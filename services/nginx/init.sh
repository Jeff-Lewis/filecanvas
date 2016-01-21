#!/bin/sh

echo "Copying nginx configuration"
rm -rf /etc/nginx/conf.d
mkdir -p /etc/nginx/conf.d
cp -r /etc/nginx/template.d/* /etc/nginx/conf.d
sed -i 's/\$HOST/'$HOST'/g' /etc/nginx/conf.d/*.conf

echo "Creating /var/log/nginx/healthd directory"
mkdir -p /var/log/nginx/healthd
chmod 777 /var/log/nginx/healthd

nginx -g 'daemon off;'
