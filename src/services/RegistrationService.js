'use strict';

function RegistrationService() {
}

RegistrationService.prototype.hasPendingUser = function(req) {
	return Boolean(req.session.registration);
};

RegistrationService.prototype.getPendingUser = function(req) {
	return req.session.registration || null;
};

RegistrationService.prototype.setPendingUser = function(req, userModel) {
	req.session.registration = userModel;
};

RegistrationService.prototype.clearPendingUser = function(req) {
	delete req.session.registration;
};

module.exports = RegistrationService;
