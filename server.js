'use strict';

var express = require('express');

var config = require('./config');
var DropboxClient = require('./src/dropbox');

var port = (process.argv[2] && Number(process.argv[2])) || process.env.PORT || process.env['npm_package_config_port'] || 80;

var dropboxClient = new DropboxClient();

dropboxClient.connect({
	appKey: config.dropbox.appKey,
	appSecret: config.dropbox.appSecret,
	appToken: config.dropbox.appToken
}, function(error, oauth) {
	if (error) {
		console.warn('Dropbox API connection error');
		throw error;
	}
	console.info('Dropbox API connected');
	dropboxClient.loadUserDetails(function(error, accountInfo) {
		console.log('Logged in as ' + accountInfo.name);
		initServer(dropboxClient);
	});

});

function initServer(dropboxClient) {
	var app = express();

	app.get('/', function(req, res) {
		res.setHeader('Content-Type', 'text/html');
		res.send('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>WebFolder.io</title></head><body><h1>WebFolder.io</h1></body></html>');
	});

	app.listen(port);

	console.log('Server listening on port ' + port);
}
