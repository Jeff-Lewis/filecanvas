print('');
print('Initializing database:');
print('');


print(' - Switching to database \'shunt\'...');
var shunt = db.getSiblingDB('shunt');


print(' - Dropping \'users\' collection...');
shunt.users.drop();

print(' - Dropping \'sites\' collection...');
shunt.sites.drop();


print(' - Setting \'uid\' index on \'users\' collection...');
shunt.users.createIndex({ 'uid': 1 }, { 'unique': true });
print(' - Setting \'alias\' index on \'users\' collection...');
shunt.users.createIndex({ 'alias': 1 }, { 'unique': true });

print(' - Setting \'user, alias\' index on \'sites\' collection...');
shunt.sites.createIndex({ 'user': 1, 'alias': 1 }, { 'unique': true });
print(' - Setting \'user\' index on \'sites\' collection...');
shunt.sites.createIndex({ 'user': 1 });


print(' - Adding \'timkendrick\' user to \'users\' collection...');
shunt.users.save({
	'uid': 251378090,
	'token': null,
	'alias': 'timkendrick',
	'name': 'Tim Kendrick',
	'email': 'timkendrick@gmail.com',
	'default': 'acme'
});


print(' - Adding \'shunt/extranet\' site to \'sites\' collection...');
shunt.sites.save({
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
	'cache': null
});


print('');
print('Database initialized successfully.');
print('');
