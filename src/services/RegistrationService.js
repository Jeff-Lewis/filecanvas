'use strict';

function RegistrationService() {
}

RegistrationService.prototype.hasPendingUser = function(req) {
	return Boolean(req.session.registration);
};

RegistrationService.prototype.getPendingUser = function(req) {
	return req.session.registration || null;
};

RegistrationService.prototype.setPendingUser = function(req, userDetails, adapter, adapterConfig) {
	req.session.registration = {
		user: userDetails,
		adapter: adapter,
		adapterConfig: adapterConfig
	};
};

RegistrationService.prototype.clearPendingUser = function(req) {
	delete req.session.registration;
};

module.exports = RegistrationService;
