# Build client libraries
(cd client/admin; webpack -p)
(cd client/api; webpack -p)
(cd client/editor; webpack -p)

# Build Dropbox library
(cd node_modules/dropbox; NODE_ENV=development NPM_CONFIG_PRODUCTION=false npm_config_production=false npm install)
