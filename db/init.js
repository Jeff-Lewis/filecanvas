print('');
print('Initializing database:');
print('');


print(' - Switching to database \'shunt\'...');
var shunt = db.getSiblingDB('shunt');


print(' - Dropping \'users\' collection...');
shunt.users.drop();

print(' - Dropping \'sites\' collection...');
shunt.sites.drop();


print(' - Setting \'username\' index on \'users\' collection...');
shunt.users.createIndex({ 'username': 1 }, { 'unique': true });
print(' - Setting \'adapters.dropbox.uid\' index on \'users\' collection...');
shunt.users.createIndex({ 'adapters.dropbox.uid': 1 }, { 'unique': true, 'sparse': true });

print(' - Setting \'owner, name\' index on \'sites\' collection...');
shunt.sites.createIndex({ 'owner': 1, 'name': 1 }, { 'unique': true });
print(' - Setting \'owner\' index on \'sites\' collection...');
shunt.sites.createIndex({ 'owner': 1 });


print('');
print('Database initialized successfully.');
print('');
