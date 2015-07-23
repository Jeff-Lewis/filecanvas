# Getting started with Shunt

This guide contains everything you need to make the most out of Shunt.

For anything not explained here, try the **FAQ** and **Support** pages at [https://my.${host}/](https://my.${host}/).

## Site details

| Web address | Site folder within ${user.profileName}'s Dropbox |
| ----------- | ------------------------------------------------ |
| [https://${user.alias}.${host}/${site.alias}](https://${user.alias}.${host}/${site.alias}) | `${site.path}` |


- This site's settings can be changed at any time by visiting its [settings page](https://my.${host}/sites/${site.alias}/settings).


## Basic usage

- Any files copied into this site's Dropbox folder will automatically appear in your Shunt site.

- Try putting some files and folders in the site's Dropbox folder. They should appear on the Shunt site as soon as they've finished syncing.

- **IMPORTANT:** If you move the site folder within your Dropbox, make sure to update the site folder path in this site's [settings page](https://my.${host}/sites/${site.alias}/settings).


## Changing the order of your files

- The order that files appear in is determined by their filename.

- If a filename starts with a number (e.g. `01 Invoice.pdf`), this number will be used to determine the file ordering.

- These numbers won't be visible to users viewing the Shunt site.


## Categorising your files

- Files can be categorised into groups.

- To create a file group, just make a new folder in your site folder and put files inside it.

- File groups are ordered by their folder name, just like the file ordering.

- File groups can contain sub-groups that are used to filter within a file group.

- To create a sub-group, just make a new folder inside the file group folder and put files inside it.

- Sub-groups are ordered by their folder name, just like the file ordering.

- **IMPORTANT:** Any files nested deeper than the sub-group level will not show up in the site.


## Collaborating with others

- You can share the site's Dropbox folder with other Dropbox users to allow them to collaborate on your Shunt site.

- Any changes they make to the site folder contents will be reflected in the Shunt site.


## Password-protecting your site

- You can protect this site by requiring users to log in with a username/password combination.

- To enable password protection for this site:
	1. Log into this site's [settings page](https://my.${host}/sites/${site.alias}/settings)
	2. Under the **Site access** section, check the **Password protect this site** checkbox
	3. Click the **Save changes** button to make the site private
	4. Under the **Password protection** section, edit the **Registered users** to set the username/password combinations that allow access to the site


## Using a custom domain name

- To set up a custom domain name for this site:
> This example assumes you want to serve your Shunt site from the `www` subdomain of your domain. The same steps apply for all other subdomains.

	1. Log into your DNS provider's admin area
	2. Set up a CNAME alias record with the following values:

		| Type | Name | Value | TTL |
		| ---- | ---- | ----- | --- |
		| `CNAME` | `www` | `${site.alias}.${user.alias}.${host}` | `86400` |


          3. (Optional) Set up your DNS provider to automatically redirect the root domain to the `www` subdomain

- See the Shunt [FAQ](https://my.${host}/faq) page for more information about custom domain names.
