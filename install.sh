#!/usr/bin/env bash

# Build client libraries
echo "Building client libraries..."
(cd client/admin; webpack -p)
(cd client/api; webpack -p)
(cd client/editor; webpack -p)
(cd client/overlay; webpack -p)
