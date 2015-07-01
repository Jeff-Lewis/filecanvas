print('');
print('Initialising database:');
print('');


print(' - Switching to database \'shunt\'...');
db = db.getSiblingDB('shunt');


print(' - Dropping \'users\' collection...');
db.users.drop();

print(' - Dropping \'sites\' collection...');
db.sites.drop();


print(' - Setting \'uid\' index on \'users\' collection...');
db.users.ensureIndex({ 'uid': 1 }, { 'unique': true });
print(' - Setting \'alias\' index on \'users\' collection...');
db.users.ensureIndex({ 'alias': 1 }, { 'unique': true });

print(' - Setting \'user, alias\' index on \'sites\' collection...');
db.sites.ensureIndex({ 'user': 1, 'alias': 1 }, { 'unique': true });
print(' - Setting \'user\' index on \'sites\' collection...');
db.sites.ensureIndex({ 'user': 1 });

print(' - Setting \'name\' index on \'domains\' collection...');
db.domains.ensureIndex({ 'name': 1 });
print(' - Setting \'user, site\' index on \'domains\' collection...');
db.domains.ensureIndex({ 'user': 1, 'site': 1 }, { 'unique': true });


print(' - Adding \'shunt\' user to \'users\' collection...');
db.users.save({
	'uid': 251378090,
	'token': null,
	'alias': 'timkendrick',
	'name': 'Tim Kendrick',
	'email': 'timkendrick@gmail.com',
	'default': 'acme'
});


print(' - Adding \'shunt/extranet\' site to \'sites\' collection...');
db.sites.save({
	'user': 251378090,
	'alias': 'acme',
	'name': 'Acme Extranet',
	'title': 'Extranet | Acme',
	'template': 'fathom',
	'path': '/shunt/acme-extranet',
	'public': false,
	'users': [
		{
			'username': 'user',
			'password': '8cd7904a44fb949b6b6651a1b171a7414da5eb5e40610a30e514c091d221bd54',
			'salt': '14io6xWHl:GGp}x-y@gvuMNg|k:7BO&M1*7M7%}p'
		}
	],
	'domains': [
		'acme-extranet.example.com'
	],
	'cache': null
});

print('');
print('Database initialized successfully.');
print('');
