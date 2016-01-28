#!/usr/bin/env bash

# Build client libraries
echo "Building client libraries..."
rm -f ./templates/admin/assets/js/filecanvas-*.js
rm -f ./templates/admin/assets/js/filecanvas-*.js.map
if [ $DEBUG == 'true' ]; then
	(cd client/admin; webpack -d --watch) &
	(cd client/api; webpack -d --watch) &
	(cd client/editor; webpack -d --watch) &
	(cd client/overlay; webpack -d --watch) &
else
	(cd client/admin; webpack -p)
	(cd client/api; webpack -p)
	(cd client/editor; webpack -p)
	(cd client/overlay; webpack -p)
fi
