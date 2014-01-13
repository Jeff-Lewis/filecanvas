'use strict';

var express = require('express');
var app = express();

var port = (process.argv[2] && Number(process.argv[2])) || process.env.PORT || process.env['npm_package_config_port'] || 80;

app.get('/', function(req, res){
	res.setHeader('Content-Type', 'text/html');
	res.send('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>WebFolder.io</title></head><body><h1>WebFolder.io</h1></body></html>');
});

app.listen(port);

console.log('Server listening on port ' + port);
