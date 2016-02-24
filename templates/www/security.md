---
title: Security
---

# Security at Filecanvas

Your safety and security are very important to us. We're not just saying that: our entire service depends on being able to guarantee that your data is totally safe when using Filecanvas. With this in mind, we thought it's important that we let you know exactly how we go about ensuring this safety.

## Summary

- The account login process is handled by your cloud storage provider – i.e. Google or Dropbox
- Filecanvas does not store your account username or password
- Filecanvas does not store any of your files
- Filecanvas will never share any of your personal data with third parties
- Filecanvas will never do anything you haven't authorised it to do
- Filecanvas will only interact with your cloud storage in the ways discussed on this page
- Filecanvas is solidly built around security best practices to keep your data safe at all times
- All communication to and from filecanvas.com is fully encrypted using HTTPS
- Pro tip: For optimum security, create a cloud storage account that you use solely for Filecanvas

Read on for a more detailed explanation of some of the different security aspects within the Filecanvas serivce.


## Account login

The account login process is handled by your cloud storage provider – i.e. Google or Dropbox.

When you're logging into Filecanvas via Dropbox or Google Drive, you're communicating directly with them. We don't have access to any of your login details that you enter during this process: we effectively just get a message back from your cloud storage provider saying "Yes, this person has provided valid login details. Here's a token that you can use as proof that this took place."

- Filecanvas does **not** have access to your cloud storage account username or password.
- When you authorise the Filecanvas app, it requests three pieces of information from your cloud storage provider:
	- Your name (first name and last name)
	- Your email address
	- An *access token* that allows Filecanvas to use the cloud storage provider's API

### How we use your name

Your name is solely used for our communication with you. Call us old-fashioned, but we feel that "Dear user102192401" lacks the personal touch. We will never give your name to third parties.

### How we use your email address

Again, we need your email address purely so we can contact you. We're not interested in selling your data. We will never give your email address to third parties.

### How we use your cloud storage access token

In order for Filecanvas to display the contents of your folders, the service needs to be able to get an up-to-date folder listing from your cloud storage provider.

This means Filecanvas needs some method of authenticating with your cloud storage provider, to prove that it has been authorised to access your cloud storage service.

The cloud storage provider handles this by granting Filecanvas an *access token*. This provides a much safer alternative than sharing your login details. It's effectively like granting guest access to Filecanvas.

- In the extremely unlikely event that an attacker manages to intercept this access token, the token can be instantly revoked, making it useless to the attacker
	- Even if an access token is somehow compromised, your cloud storage account username and password are still completely safe
	- There is no way an attacker can use your access token to lock you out of your account
- You can choose to revoke your access token at any time from your cloud storage provider's account settings area, however this will prevent Filecanvas from being able to list your files and therefore your canvases will suddenly appear empty
- If you accidentally revoke your access token, you can automatically create a new access token and restore the service by logging into your Filecanvas account


## Cloud storage permissions

When you authorise the Filecanvas app, you're allowing Filecanvas to interact with your cloud storage provider. Here's an explanation of why we ask for the permissions we do.

### Why does Filecanvas need my name and email address?

As stated above, these are used purely for communication purposes. We will never pass these on to third parties.

### Why does Filecanvas need read/write access to my cloud storage, rather than just read-only?

When you create a canvas, Filecanvas automatically creates a synced folder for you to put your files in, and when you delete a canvas, Filecanvas may ask you whether you also want to delete the synced folder. It also allows you to upload files to your canvases via the web interface. It can't do these without read/write access to your cloud storage. These are the only situations where Filecanvas will write to your cloud storage.

### Why does Filecanvas need to access my cloud storage when I'm not logged in?

Filecanvas needs this for its automatic folder syncing. Whenever you update a file within a synced folder, this needs to be reflected in your canvas. Seeing as you may or may not be logged into the Filecanvas admin area at this point, offline API access ensures that your canvases are kept up to date regardless of when you last logged in.

### Why does Filecanvas need access to the files outside its own folder?

It doesn't – which is particularly frustrating, seeing as we're limited by the APIs of the cloud storage providers on this one.

We'd much rather that Filecanvas only had access to its own "Filecanvas" folder within your cloud storage, both for security and performance reasons. Unfortunately, we're waiting for the APIs to catch up:

- The Google Drive API doesn't allow file API access to be restricted to a specific folder.
- The Dropbox API does allow this, however a [long-standing issue](https://www.dropboxforum.com/hc/en-us/community/posts/201415209-Sharing-of-folders-inside-the-Apps-folder) means that app-specific folders cannot be shared with other Dropbox users. This would break the ability to collaborate on a canvas, which is core to the Filecanvas experience.

Hopefully the cloud storage providers will fix these issues. In the meantime, you can rest assured that Filecanvas will never access any of the files outside your synced folder.

### I don't feel comfortable giving Filecanvas full access to my cloud storage folder. Do I have any other options?

Yes. For optimum security, we recommend creating an account with your cloud storage provider that you use solely for Filecanvas. Your synced folders will be created in this account, and can then be shared by adding your usual account as a collaborator. This way you can be sure that Filecanvas has access to your synced folders and nothing else.


## How we interact with your cloud storage provider's API

Once you've authorised the Filecanvas app, the Filecanvas service is given an access token that allows it to communicate with your cloud storage provider (i.e. Google Drive or Dropbox).

This communication happens via their web API (Application Programming Interface) – a service that allows the Filecanvas servers to communicate with your cloud storage provider's servers.

Filecanvas uses your cloud storage provider's API to perform the following functions (where "synced folder" refers to a folder created by Filecanvas):

- **List folder hierarchy and file metadata within your synced folders**
	- This is necessary so that Filecanvas can display the contents of your synced folders when a user visits your canvas
	- Rather than loading the contents of the file themselves, Filecanvas just uses file "metadata" (e.g. filename, filesize, size, etc) to display the files to the user
- **Display file preview thumbnails within your synced folders**
	- When a user visits your canvas, Filecanvas shows file preview thumbnails for various file types
	- These thumbnails are created by your cloud storage provider – Filecanvas just passes them on to the user as-is, without storing them
- **Download files from your synced folders**
	- When a user chooses to download a file from your canvas, Filecanvas creates a temporary download link that allows the user to download the file
	- These links expire within several hours, and contain a randomly generated unique ID to prevent unauthorised access
	- In order to prevent leaking your access token to the end user, these links may be proxied through a Filecanvas server. Filecanvas performs this proxying service solely to shield your sensitive information from the end user, and does not sniff or store the contents of the file during transfer
	- This technique is also used to allow users to preview files within your canvas, and to allow users to visit web links that have been saved as shortcut files
- **Create a folder**
	- When you create a canvas, Filecanvas automatically creates a synced folder for you to put your files in
	- This folder may contain example content, e.g. a "Getting Started" guide or an album of placeholder photos
	- Filecanvas will never create a folder within your cloud storage without your express authorisation
- **Upload files to your synced folders**
	- This is necessary to allow you to upload files to your canvases via the web interface
	- Filecanvas will never upload files to your cloud storage without your express authorisation
- **Delete a synced folder**
	- When you delete a canvas, Filecanvas may ask you if you also want to delete the synced folder
	- Filecanvas will never delete a folder within your cloud storage without your express authorisation


## Password-protected canvases

You can choose to restrict access to your canvases by adding password protection, so that users have to log in before they are able to access the contents of the canvas.

Unlike your account login, these passwords _are_ handled by the Filecanvas servers. We use the following best practices to ensure these passwords are kept safe:

- Passwords are combined with a randomly-generated per-password salt and hashed using the **bcrypt** algorithm, and the resulting hash is stored to a database.
- This means that the password itself is never stored in the database, only the salted hash.
- The password cannot be derived from the hash. Even if an attacker were to obtain the hash it would be computationally infeasible to trace that back to the original password.
- This means that by design, we have no way of retrieving a lost password for a password-protected canvas. If you lose a canvas user's password, you'll have to create a new password for that user in the canvas's settings page.


## Get in touch

Hopefully this has helped demystify some of the processes that ensure your security when using the Filecanvas service. If anything seems unclear, or if you have any security-related questions, please don't hesitate to get in touch at [info@filecanvas.com](mailto:info@filecanvas.com).
