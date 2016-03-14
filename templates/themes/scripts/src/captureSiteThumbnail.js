'use strict';

var fs = require('fs');
var http = require('http');
var stream = require('stream');
var util = require('util');
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
var screenshotStream = require('screenshot-stream');
var imagemagick = require('imagemagick-native');
var PngDatastream = require('png-datastream').default;
var multipipe = require('multipipe');

module.exports = function(options) {
	options = options || {};
	var siteRoot = options.siteRoot;
	var dimensions = options.dimensions;
	var outputOptions = options.output;
	var log = options.log || global.console.log;

	log('Serving static files from ' + siteRoot);
	return launchStaticServer(siteRoot)
		.then(function(server) {
			var url = 'http://localhost:' + server.address().port + '/';
			log('Started preview server at ' + url);
			return saveUrlScreenshot({
				url: url,
				dimensions: dimensions,
				output: outputOptions
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
		var dimensions = options.dimensions;
		var outputOptions = options.output;

		return new Promise(function(resolve, reject) {
			return screenshotStream(url, dimensions.width + 'x' + dimensions.height, {
				crop: true
			})
				.on('warn', function(message) {
					reject(new Error(message));
				})
				.on('error', reject)
				.pipe(saveResizedImage(outputOptions))
				.on('error', reject)
				.on('finish', resolve);
		});
	}

	function saveResizedImage(outputOptions) {
		outputOptions = (Array.isArray(outputOptions) ? outputOptions : [outputOptions]);
		var fileStreams = outputOptions.map(function(output) {
			var outputPath = output.path;
			var resizeOptions = output.resize || null;
			var resizeStream = (resizeOptions ? createResizeStream({
				width: resizeOptions.width,
				height: resizeOptions.height
			}) : new stream.PassThrough());
			log('Saving screenshot to ' + outputPath);
			return multipipe(resizeStream, fs.createWriteStream(outputPath));
		});
		return mergeWriteStreams(fileStreams);


		function mergeWriteStreams(streams) {

			function MergedWriteStream(streams) {
				stream.Writable.call(this);

				this.setMaxListeners(Infinity);

				var self = this;
				var hasFinished = false;
				var numRemaining = streams.length;

				var inputStream = new stream.PassThrough();
				inputStream.on('error', function(error) {
					if (hasFinished) { return; }
					hasFinished = true;
					self.emit('error', error);
				});

				streams.forEach(function(stream) {
					stream.once('error', function(error) {
						if (hasFinished) { return; }
						hasFinished = true;
						self.emit('error', error);
					});

					stream.once('finish', function() {
						if (hasFinished) { return; }
						if (--numRemaining === 0) {
							hasFinished = true;
							self.emit('finish');
						}
					});

					inputStream.pipe(stream);
				});

				this._inputStream = inputStream;
			}

			util.inherits(MergedWriteStream, stream.Writable);

			MergedWriteStream.prototype._write = function(chunk, enc, done) {
				this._inputStream.write(chunk, enc, done);
			};
			MergedWriteStream.prototype.end = function(chunk, enc, done) {
				this._inputStream.end(chunk, enc, done);
			};

			return new MergedWriteStream(streams);
		}
	}

	function createResizeStream(options) {
		var width = options.width;
		var height = options.height;
		var pngConverterStream = createPngConverterStream({
			width: width,
			height: height
		});
		var metadataStrippingStream = createPngTimeMetadataStripperStream();
		return multipipe(pngConverterStream, metadataStrippingStream);


		function createPngConverterStream(options) {
			var width = options.width;
			var height = options.height;
			return imagemagick.streams.convert({
				width: width,
				height: height,
				resizeStyle: 'aspectfit',
				format: 'PNG',
				quality: 100
			});
		}

		function createPngTimeMetadataStripperStream() {

			function PngTimeDateMetadataStripperStream() {
				if (!(this instanceof PngTimeDateMetadataStripperStream)) {
					return new PngTimeDateMetadataStripperStream();
				}

				this._chunks = [];

				stream.Transform.call(this, options);
			}

			util.inherits(PngTimeDateMetadataStripperStream, stream.Transform);

			PngTimeDateMetadataStripperStream.prototype._transform = function(chunk, enc, done) {
				this._chunks.push(chunk);
				done();
			};

			PngTimeDateMetadataStripperStream.prototype._flush = function(done) {
				var inputBuffer = Buffer.concat(this._chunks);
				this._chunks = null;
				var png = deserializePngBuffer(inputBuffer);
				png.setChunks(png.chunks.filter(function(chunk) {
					return !isDateMetadataChunk(chunk);
				}));
				var outputBuffer = serializePngBuffer(png);
				this.push(outputBuffer);
				done();

				function isDateMetadataChunk(chunk) {
					if (chunk.type.type === 'tIME') { return true; }
					if (chunk.type.type === 'tEXt') {
						if (chunk.keyword === 'date:create') { return true; }
						if (chunk.keyword === 'date:modify') { return true; }
					}
					return false;
				}
			};

			return new PngTimeDateMetadataStripperStream();


			function deserializePngBuffer(buffer) {
				return PngDatastream.fromArrayBuffer(new Uint8Array(buffer).buffer);
			}

			function serializePngBuffer(png) {
				return new Buffer(new Uint8Array(png.toArrayBuffer()));
			}
		}
	}
};
