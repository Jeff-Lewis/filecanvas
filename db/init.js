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
print(' - Setting \'username\' index on \'users\' collection...');
shunt.users.createIndex({ 'username': 1 }, { 'unique': true });

print(' - Setting \'user, name\' index on \'sites\' collection...');
shunt.sites.createIndex({ 'user': 1, 'name': 1 }, { 'unique': true });
print(' - Setting \'user\' index on \'sites\' collection...');
shunt.sites.createIndex({ 'user': 1 });


print('');
print('Database initialized successfully.');
print('');
