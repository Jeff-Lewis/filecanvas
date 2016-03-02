#!/usr/bin/env bash

set -e

echo "Building client libraries..."
rm -f ./templates/admin/assets/js/filecanvas-*.js
rm -f ./templates/admin/assets/js/filecanvas-*.js.map
if [ "$NODE_ENV" == 'production' ]; then
	(cd client/admin; webpack -p)
	(cd client/api; webpack -p)
	(cd client/editor; webpack -p)
	(cd client/overlay; webpack -p)
else
	(cd client/admin; webpack -d --watch) &
	(cd client/api; webpack -d --watch) &
	(cd client/editor; webpack -d --watch) &
	(cd client/overlay; webpack -d --watch) &
fi

echo "Building theme previews..."
THEMES_DIR=./themes
THEMES_OUTPUT_DIR=${THEMES_ROOT:-./data/themes}
rm -rf $THEMES_OUTPUT_DIR
mkdir -p $THEMES_OUTPUT_DIR
for theme in $(ls $THEMES_DIR | grep -v ^_); do
	./workers/theme/bundle $THEMES_DIR/$theme $THEMES_OUTPUT_DIR/$theme
done
