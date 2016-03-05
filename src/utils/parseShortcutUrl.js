'use strict';

var ini = require('ini');
var plist = require('plist');

module.exports = function(shortcutFileContents, options) {
	var shortcutType = options.type;
	switch (shortcutType) {
		case 'url':
			return parseWindowsShortcutUrl(shortcutFileContents);
		case 'webloc':
			return parseOsXShortcutUrl(shortcutFileContents);
		case 'desktop':
			return parseLinuxShortcutUrl(shortcutFileContents);
		default:
			throw new Error('Invalid shortcut file type: ' + shortcutType);
	}


	function parseWindowsShortcutUrl(shortcutFileContents) {
		var data = ini.parse(shortcutFileContents.toString());
		return data['InternetShortcut'].URL;
	}

	function parseOsXShortcutUrl(shortcutFileContents) {
		var data = plist.parse(shortcutFileContents.toString());
		return data.URL;
	}

	function parseLinuxShortcutUrl(shortcutFileContents) {
		var data = ini.parse(shortcutFileContents.toString());
		return data['Desktop Entry'].URL;
	}
};
