# Getting started with Filecanvas

This guide contains everything you need to make the most out of Filecanvas.

For anything not explained here, try the **FAQ** and **Support** pages at [${host.protocol}//my.${host.hostname}/](${host.protocol}//my.${host.hostname}/).


## Filecanvas admin section

The Filecanvas admin section is located at [${host.protocol}//my.${host.hostname}/](${host.protocol}//my.${host.hostname}/canvases)

Log into the Filecanvas admin section to perform actions on this canvas.


## Editing your canvas

- You can edit the appearance of this canvas by logging into the Filecanvas admin section and following the 'Edit canvas' link in this canvas's settings page.

- Use the 'Theme Options' panel within the canvas editor to customise the canvas.


## Uploading files via the Filecanvas admin section

- You can upload files to this canvas through the Filecanvas admin section, by following the 'Edit canvas' link in this canvas's settings page.

- Within the canvas editor you can drag files onto the preview area to upload them to your canvas.

- Any files you upload through the canvas editor will be added to your synced folder.


## Uploading files by adding directly to the synced folder

- This canvas is synced to a folder in your Dropbox or Google Drive.

- Any files copied into this canvas's synced folder will automatically appear on the canvas.

- Try putting some files and folders in the canvas's synced folder. Once they've finished syncing, you should be able to see them in-situ by visiting the canvas preview within the Filecanvas admin section.

- If you move the folder within your Dropbox or Google Drive, make sure to update the folder path in this canvas's settings page within the Filecanvas admin section.


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


## Collaborating with others

- You can share the canvas's synced folder with users to allow them to collaborate on your canvas.

- Any changes they make to the folder contents will be reflected in the canvas.


## Password-protecting your canvas

- You can protect this canvas by requiring users to log in with a username/password combination.

- To enable password protection for this canvas:
	1. Log into this canvas's settings page within the Filecanvas admin section
	2. Under the **Password protection** section, check the **Password protect this canvas** checkbox
	3. Click the **Save changes** button to make the canvas private
	4. Under the **Password protection** section, edit the **Registered users** to set the username/password combinations that allow access to the canvas


## Publishing your canvas

- When a canvas is created, it starts off in the 'unpublished' state. This means that you can edit it and preview it, but nobody else can see the canvas.

- When you're ready to take the canvas online, click the 'Publish canvas' link in this canvas's settings page within the Filecanvas admin section.

- Once a canvas has been published, it will be accessible via its web address.

- You can unpublish a canvas at any point.


## Using a custom domain name

- To set up a custom domain name for this canvas:

	> This example assumes you want to serve your canvas from the `www` subdomain of your domain. The same steps apply for all other subdomains.

	1. Log into your DNS provider's admin area
	2. Set up a CNAME alias record with the following values (where `${site.name}` is the canvas's ID, as seen in its web address):

		| Type | Name | Value | TTL |
		| ---- | ---- | ----- | --- |
		| `CNAME` | `www` | `${site.name}.${user.username}.${host.hostname}` | `86400` |

	3. (Optional) Set up your DNS provider to automatically redirect the root domain to the `www` subdomain

- A canvas must be published fo it to be accessed via a custom domain name.

- See the Filecanvas [FAQ](${host.protocol}//my.${host.hostname}/faq) page for more information about custom domain names.
