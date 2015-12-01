# Getting started with Filecanvas

This guide contains everything you need to make the most out of Filecanvas.

For anything not explained here, try the **FAQ** and **Support** pages at [https://my.${host}/](https://my.${host}/).

## Site details

| Web address | Folder within ${site.root.adapter === 'dropbox' ? user.adapters.dropbox.firstName + ' ' + user.adapters.dropbox.lastName + '’s Dropbox' : 'Filecanvas server'} |
| ----------- | ------------------------------------------------ |
| [http://${user.username}.${host}/${site.name}](http://${user.username}.${host}/${site.name}) | `${site.root.path}` |


- This canvas's settings can be changed at any time by visiting its [settings page](https://my.${host}/canvases/${site.name}/settings).


## Basic usage

- Any files copied into this canvas's Dropbox folder will automatically appear on the canvas.

- Try putting some files and folders in the canvas's Dropbox folder. They should appear on the canvas as soon as they've finished syncing.

- **IMPORTANT:** If you move the folder within your Dropbox, make sure to update the folder path in this canvas's [settings page](https://my.${host}/canvases/${site.name}/settings).


## Changing the order of your files

- The order that files appear in is determined by their filename.

- If a filename starts with a number (e.g. `01 Invoice.pdf`), this number will be used to determine the file ordering.

- These numbers won't be visible to users viewing the canvas.


## Categorising your files

- Files can be categorised into groups.

- To create a file group, just make a new folder in your canvas folder and put files inside it.

- File groups are ordered by their folder name, just like the file ordering.

- File groups can contain sub-groups that are used to filter within a file group.

- To create a sub-group, just make a new folder inside the file group folder and put files inside it.

- Sub-groups are ordered by their folder name, just like the file ordering.

- **IMPORTANT:** Any files nested deeper than the sub-group level will not show up in the canvas.


## Collaborating with others

- You can share the canvas's Dropbox folder with other Dropbox users to allow them to collaborate on your canvas.

- Any changes they make to the folder contents will be reflected in the canvas.


## Password-protecting your canvas

- You can protect this canvas by requiring users to log in with a username/password combination.

- To enable password protection for this canvas:
	1. Log into this canvas's [settings page](https://my.${host}/canvases/${site.name})
	2. Under the **Password protection** section, check the **Password protect this canvas** checkbox
	3. Click the **Save changes** button to make the canvas private
	4. Under the **Password protection** section, edit the **Registered users** to set the username/password combinations that allow access to the canvas


## Using a custom domain name

- To set up a custom domain name for this canvas:

	> This example assumes you want to serve your canvas from the `www` subdomain of your domain. The same steps apply for all other subdomains.

	1. Log into your DNS provider's admin area
	2. Set up a CNAME alias record with the following values:

		| Type | Name | Value | TTL |
		| ---- | ---- | ----- | --- |
		| `CNAME` | `www` | `${site.name}.${user.username}.${host}` | `86400` |

	3. (Optional) Set up your DNS provider to automatically redirect the root domain to the `www` subdomain

- See the Filecanvas [FAQ](https://my.${host}/faq) page for more information about custom domain names.
