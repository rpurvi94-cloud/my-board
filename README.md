# My Boards

My Boards is a browser-based personal dashboard for organizing photos, videos, YouTube links, books, tasks, goal trackers, website notes, and a password-protected personal diary. It uses Firebase Authentication for email/password accounts, Cloud Firestore to sync board data, and Firebase Storage for diary video attachments.

## Run locally

The app uses JavaScript modules, so open it through a local web server rather than opening `index.html` directly with `file://`.

For example, with Python installed:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000>. The login page is the site root only if a server provides `index.html`; otherwise open <http://localhost:8000/login.html>.

## Firebase setup

The Firebase project configuration is in [`firebase.js`](./firebase.js). To use authentication and cloud sync:

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**. To use the Google button on the login page, also enable **Google** and configure its support email. Password reset uses Firebase Authentication's email action settings.
2. Create a **Cloud Firestore** database.
3. In **Authentication → Settings → Authorized domains**, authorize the hostnames you use, such as `localhost` and your GitHub Pages hostname.
4. Publish Firestore rules that restrict each account to its own document:

   ```text
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null
                            && request.auth.uid == userId;
       }
     }
   }
   ```

5. Enable **Storage** and publish rules that restrict diary uploads to their owner:

   ```text
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /users/{userId}/diary/{allPaths=**} {
         allow read, write: if request.auth != null
                            && request.auth.uid == userId;
       }
     }
   }
   ```

6. On the app login page, create an account using an email address and an app password, then log in with those same credentials. This password is for the app; it does not have to be your email account's password.

The diary uses its own password to encrypt its pages in the browser before saving them to Firestore. Keep that password safe: it cannot be reset, and losing it means the encrypted diary cannot be recovered. Diary video files are stored in the account's private Firebase Storage folder.

Board data is stored in Firestore at `users/{Firebase Authentication UID}`. The app creates or updates this document when board data is saved.

## Deploy with GitHub Pages

In the repository's **Settings → Pages**, choose the branch and folder containing the site files and save. Wait for GitHub Pages to publish, then open the provided site URL. Add the Pages hostname (for example, `username.github.io`) to Firebase Authentication's authorized domains.

## Files

- `index.html`, `style.css`, `script.js` — boards interface and app logic.
- `login.html`, `login.css`, `login.js` — Firebase email/password login and registration.
- `firebase.js` — shared Firebase app, Authentication, and Firestore setup.
