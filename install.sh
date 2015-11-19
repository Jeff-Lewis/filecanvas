# Build client libraries
(cd client/admin; webpack -p)
(cd client/api; webpack -p)
(cd client/editor; webpack -p)

# Build Dropbox library
(cd node_modules/dropbox; NODE_ENV=development NPM_CONFIG_PRODUCTION=false npm_config_production=false npm install)

# Fix HTMLBars import paths
ln -s cjs/htmlbars-util node_modules/htmlbars/dist/htmlbars-util
ln -s htmlbars/dist/cjs/htmlbars-runtime node_modules/htmlbars-runtime
