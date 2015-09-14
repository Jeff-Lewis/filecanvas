cd client/api
webpack -p
cd ../..

cd client/admin
webpack -p
cd ../..

cd client/editor
webpack -p
cd ../..

cd node_modules/dropbox
NODE_ENV=development NPM_CONFIG_PRODUCTION=false npm_config_production=false npm install
