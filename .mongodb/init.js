/* global db:true */
print('');
print('Initialising database:');
print('');


print(' - Switching to database \'dropkick\'...');
db = db.getSiblingDB('dropkick');


print(' - Dropping \'organizations\' collection...');
db.organizations.drop();

print(' - Dropping \'administrators\' collection...');
db.administrators.drop();

print(' - Dropping \'dropboxUsers\' collection...');
db.dropboxUsers.drop();

print(' - Dropping \'sites\' collection...');
db.sites.drop();


print(' - Setting \'alias\' index on \'organizations\' collection...');
db.organizations.ensureIndex({ 'alias': 1 }, { 'unique': true });

print(' - Setting \'username\' index on \'administrators\' collection...');
db.administrators.ensureIndex({ 'username': 1 }, { 'unique': true });
print(' - Setting \'company\' index on \'administrators\' collection...');
db.administrators.ensureIndex({ 'company': 1 });

print(' - Setting \'email\' index on \'dropboxUsers\' collection...');
db.dropboxUsers.ensureIndex({ 'email': 1 }, { 'unique': true });
print(' - Setting \'organization\' index on \'dropboxUsers\' collection...');
db.dropboxUsers.ensureIndex({ 'organization': 1 });

print(' - Setting \'organization, alias\' index on \'sites\' collection...');
db.sites.ensureIndex({ 'organization': 1, 'alias': 1 }, { 'unique': true });
print(' - Setting \'organization\' index on \'sites\' collection...');
db.sites.ensureIndex({ 'organization': 1 });


print(' - Adding \'acme\' user to \'organizations\' collection...');
db.organizations.save({
	'alias': 'acme',
	'email': 'info@example.com',
	'name': 'Acme Corporation',
	'default': 'extranet',
	'shares': [
		{
			'alias': 'acme-extranet',
			'name': 'Acme Extranet'
		}
	]
});

print(' - Adding \'user@examle.com\' user to \'administrators\' collection...');
db.administrators.save({
	'username': 'user@example.com',
	'organization': 'acme',
	'password': '8cd7904a44fb949b6b6651a1b171a7414da5eb5e40610a30e514c091d221bd54',
	'salt': '14io6xWHl:GGp}x-y@gvuMNg|k:7BO&M1*7M7%}p',
	'name': 'John Doe',
	'email': 'user@example.com'
});

print(' - Adding \'user@example.com\' user to \'dropboxUsers\' collection...');
db.dropboxUsers.save({
	'email': 'user@example.com',
	'organization': 'acme'
});


print(' - Adding \'acme/extranet\' site to \'sites\' collection...');
db.sites.save({
	'organization': 'acme',
	'alias': 'extranet',
	'name': 'Acme Corporation Extranet',
	'title': 'Extranet | Acme Corporation',
	'template': 'identiq',
	'share': 'acme-extranet',
	'public': false,
	'users': [
		{
			'username': 'user',
			'password': '8cd7904a44fb949b6b6651a1b171a7414da5eb5e40610a30e514c091d221bd54',
			'salt': '14io6xWHl:GGp}x-y@gvuMNg|k:7BO&M1*7M7%}p'
		}
	],
	'cache': null
});

print('');
print('Database initialised successfully.');
print('');
