print(' - Setting \'username\' index on \'users\' collection...');
db.users.createIndex({ 'username': 1 }, { 'unique': true });
print(' - Setting \'adapters.dropbox.uid\' index on \'users\' collection...');
db.users.createIndex({ 'adapters.dropbox.uid': 1 }, { 'unique': true, 'sparse': true });

print(' - Setting \'owner, name\' index on \'sites\' collection...');
db.sites.createIndex({ 'owner': 1, 'name': 1 }, { 'unique': true });
print(' - Setting \'owner\' index on \'sites\' collection...');
db.sites.createIndex({ 'owner': 1 });
