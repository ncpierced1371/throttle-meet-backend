# Throttle Meet Backend

This is the backend for Throttle Meet, an automotive social platform.

## Legal Pages

Legal documents (Privacy Policy, Terms of Service, Data Deletion Instructions) are included as static HTML files in the `public/` directory:

- `/privacy.html` or `/privacy`
- `/terms.html` or `/terms`
- `/delete-account.html` or `/delete-account`

These are served as static assets and are available at the root of your deployed site.

## Build & Run

1. Install dependencies:
   ```sh
   npm install
   ```
2. Build the project:
   ```sh
   npm run build
   ```
3. Start the server:
   ```sh
   npm start
   ```

## Deployment

- Deploy to Vercel or your preferred Node.js host.
- The `public/` folder is included in the build and deployment.

## What’s Not Included in the Build

- Local dev/test scripts, docs, and migration/seed files are excluded from the build for production.

## Contact

For legal or support questions, see the legal pages or contact support@drivelinecollective.com.
