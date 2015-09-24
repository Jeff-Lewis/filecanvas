'use strict';

function RegistrationService(req) {
	this.req = req;
}

RegistrationService.prototype.hasPendingUser = function() {
	return Boolean(this.req.session.registration);
};

RegistrationService.prototype.getPendingUser = function() {
	return this.req.session.registration || null;
};

RegistrationService.prototype.setPendingUser = function(userDetails, adapter, adapterConfig) {
	this.req.session.registration = {
		user: userDetails,
		adapter: adapter,
		adapterConfig: adapterConfig
	};
	console.log('Setting pending user:', this.req.session.registration);
};

RegistrationService.prototype.clearPendingUser = function() {
	delete this.req.session.registration;
};

module.exports = RegistrationService;
