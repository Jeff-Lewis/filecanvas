#!/bin/sh

set -e

rm -rf /opt/openresty/nginx/conf/conf.d
mkdir -p /opt/openresty/nginx/conf/conf.d
cp -r /opt/openresty/nginx/conf/template.d/* /opt/openresty/nginx/conf/conf.d
sed -i 's/\$HOST/'$HOST'/g' /opt/openresty/nginx/conf/conf.d/*.conf
