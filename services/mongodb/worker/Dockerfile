FROM mongo:latest

ENV MONGODB_URL=mongodb://mongodb

VOLUME /opt/src/worker.js

CMD sleep 1 && mongo $MONGODB_URL /opt/src/worker.js
