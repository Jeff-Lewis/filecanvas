#!/usr/bin/env bash

# Build www site
echo "Generating www site..."
HOST=$HOST \
HOST_PROTOCOL="${HOST_PROTOCOL:-$([ "$HTTPS" == "true" ] && echo "https:" || echo "http:")}" \
HOST_PORT="${HOST_PORT:-$([ "$PROTOCOL" == "https:" ] && echo "$HTTPS_PORT" || echo "$PORT")}" \
TEMPLATE_DIR=./www/template \
OUTPUT_DIR=$WWW_SITE_ROOT \
	./www/build
