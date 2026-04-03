# Frontend Smoke Test Checklist

Use this checklist after any login, landing page, or training-flow change.

## Access Flow

- Open the landing page and confirm the hero, CTA buttons, and responsive layout render correctly.
- Click Sign In and confirm the login page opens without broken assets.
- Confirm the secondary login CTA returns to the landing page.

## Login Validation

- Submit an empty form and confirm inline validation appears for required fields.
- Enter an invalid email and confirm the email error is shown.
- Enter a password shorter than 8 characters and confirm the password error is shown.
- Toggle Show and Hide on the password field and confirm the control works.

## Authentication

- Attempt login with invalid credentials and confirm the backend error appears without redirecting.
- Attempt login with valid credentials and confirm redirect to training-tool/index.html.
- Confirm localStorage contains nyxApiBase, nyxOrgSlug, nyxLearnerEmail, nyxLearnerName, and nyxAuthToken after successful login.

## Session Guard

- Open training-tool/index.html in a fresh browser session without nyxAuthToken and confirm redirect to login.html?session=required.
- Confirm the login page shows the session-required message after that redirect.
- Log in again and confirm the training app loads normally.

## Training Experience

- Start the experience and confirm the training app can create an attempt successfully.
- Progress through at least one lesson or scenario and confirm no authenticated API calls fail.
- Submit completion and confirm the completion message appears.

## Logout

- Click Logout in the training header.
- Confirm localStorage auth/session values are cleared.
- Confirm the browser returns to the login page.
- Try to reopen training-tool/index.html directly and confirm it redirects back to login.

## Admin Role Builder

- Open the Facility Role Builder while signed in as an authorized role.
- Confirm role list loading still works.
- Create, edit, and delete a role and confirm backend authorization allows the action only for authorized users.
- Verify unauthorized users receive a forbidden response for role write actions.
