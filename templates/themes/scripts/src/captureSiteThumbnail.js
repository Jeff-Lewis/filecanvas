'use strict';

var fs = require('fs');
var http = require('http');
var stream = require('stream');
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
var screenshotStream = require('screenshot-stream');
var imagemagick = require('imagemagick-native');

module.exports = function(options) {
	options = options || {};
	var siteRoot = options.siteRoot;
	var outputPath = options.outputPath;
	var dimensions = options.dimensions;
	var resizeOptions = options.resize;
	var log = options.log || global.console.log;

	log('Serving static files from ' + siteRoot);
	return launchStaticServer(siteRoot)
		.then(function(server) {
			var url = 'http://localhost:' + server.address().port + '/';
			log('Started preview server at ' + url);
			return saveUrlScreenshot({
				url: url,
				outputPath: outputPath,
				dimensions: dimensions,
				resize: resizeOptions
			})
				.then(function() {
					return stopServer(server);
				})
				.then(function() {
					log('Stopped preview server');
					return;
				});
		});


	function launchStaticServer(siteRoot) {
		return new Promise(function(resolve, reject) {
			var server = createStaticServer(siteRoot);
			var randomPort = 0;
			server.listen(randomPort, function(error) {
				if (error) { return reject(error); }
				resolve(server);
			});
		});


		function createStaticServer(siteRoot) {
			var serve = serveStatic(siteRoot);
			return http.createServer(function(req, res) {
				serve(req, res, finalhandler(req, res));
			});
		}
	}

	function stopServer(server) {
		return new Promise(function(resolve, reject) {
			server.close(function(error) {
				if (error) { return reject(error); }
				resolve();
			});
		});
	}

	function saveUrlScreenshot(options) {
		options = options || {};
		var url = options.url;
		var outputPath = options.outputPath;
		var dimensions = options.dimensions;
		var resizeOptions = options.resize;

		return new Promise(function(resolve, reject) {
			return screenshotStream(url, dimensions.width + 'x' + dimensions.height, {
				crop: true
			})
				.on('warn', function(message) {
					reject(new Error(message));
				})
				.on('error', reject)
				.pipe(resizeOptions ? imagemagick.streams.convert({
					width: resizeOptions.width,
					height: resizeOptions.width,
					resizeStyle: 'aspectfit',
					format: 'PNG',
					quality: 100
				}) : new stream.PassThrough())
				.on('error', reject)
				.pipe(fs.createWriteStream(outputPath))
				.on('error', reject)
				.on('finish', resolve);
		});
	}
};
