#!/usr/bin/env bash

# Build client libraries
echo "Building client libraries..."
rm -f ./templates/admin/assets/js/filecanvas-*.js
rm -f ./templates/admin/assets/js/filecanvas-*.js.map
(cd client/admin; webpack -p)
(cd client/api; webpack -p)
(cd client/editor; webpack -p)
(cd client/overlay; webpack -p)
