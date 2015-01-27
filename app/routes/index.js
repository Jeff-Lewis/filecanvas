module.exports = (function() {
	'use strict';

	var express = require('express');

	var app = express();

	app.get('/', function(req, res) {
		res.send('<!DOCTYPE html><html lang="en"><head><link rel="stylesheet" href="http://maxcdn.bootstrapcdn.com/bootswatch/3.3.2/cerulean/bootstrap.min.css"/><style>body { margin: 0 1em } h1 { font-size: 6em; font-weight: 500; line-height: 1; margin: 1.5em 0 0.5em; text-align: center; color: #317eac; } h2 { font-size: 1.5em; font-weight: 300; line-height: 1.2; text-align: center; color: #555555; } form { margin: 5em 0;}</style><meta charset="utf-8"/><title>Shunt.io</title></head><body><h1>Shunt.io</h1><h2>Share your files to the web instantly and securely.</h2><div class="text-center"><form class="form-inline" action="http://shunt.us10.list-manage.com/subscribe/post?u=8065dfdfb971530150a54c4b9&amp;id=89ad53389f" method="post" target="_blank" novalidate><div class="form-group"><label class="sr-only" for="email">Email address</label><input type="email" class="form-control" value="" name="EMAIL" id="email" placeholder="Email address"></div><button type="submit" class="btn btn-primary" value="Subscribe" name="subscribe">Get updates</button></form></body></html></div>');
	});

	return app;
})();
