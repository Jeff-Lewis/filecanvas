# Build www site
if [ $WWW_SITE_ROOT ]; then
	echo "Updating site generator npm packages..."
	(cd services/www; npm install)

	echo "Generating www site..."
	HOSTNAME=$HOST
	PROTOCOL="${HOST_PROTOCOL:-$([ "$HTTPS" == "true" ] && echo "https:" || echo "http:")}"
	PORT="${HOST_PORT:-$([ "$PROTOCOL" == "https:" ] && echo "$HTTPS_PORT" || echo "$PORT")}"

	HOST=$HOST \
	HOST_PROTOCOL=$PROTOCOL \
	HOST_PORT=$PORT \
	TEMPLATE_DIR=./templates/www \
	OUTPUT_DIR=$WWW_SITE_ROOT \
		./services/www/build
fi

# Build client libraries
echo "Building client libraries..."
(cd client/admin; webpack -p)
(cd client/api; webpack -p)
(cd client/editor; webpack -p)
(cd client/overlay; webpack -p)
