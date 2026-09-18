# Google OAuth 2.0 Setup Guide for Re:COVER

This guide documents the exact configuration required in the Google Cloud Console to establish a valid OAuth 2.0 Web Server connection for the Re:COVER platform.

---

## 1. Google Cloud Project Setup

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing project (e.g., `recover-security-platform`).
3. Ensure the **Google Identity Services** / APIs are enabled.

---

## 2. Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**.
2. **User Type**:
   - For internal/testing: Select **External** (or **Internal** if using a Google Workspace organization).
3. **App Information**:
   - **App name**: `Re:COVER`
   - **User support email**: Your development/admin email.
   - **Developer contact information**: Your contact email.
4. **Scopes**:
   - Click **Add or Remove Scopes**.
   - Select the non-sensitive identity scopes:
     - `openid`
     - `.../auth/userinfo.email` (email)
     - `.../auth/userinfo.profile` (profile)
   - *Note: Do NOT add sensitive scopes (Gmail, Drive, Admin) in this task. They will be added incrementally in later tasks when specific monitoring capabilities are built.*
5. **Test Users**:
   - Add your test Google account email under **Test users** while the app publishing status is in **Testing** mode.

---

## 3. Create OAuth 2.0 Client Credentials

1. Navigate to **APIs & Services** → **Credentials**.
2. Click **Create Credentials** → **OAuth client ID**.
3. **Application type**: Select **Web application**.
4. **Name**: `Re:COVER Backend Server`.
5. **Authorized JavaScript origins**:
   - `http://localhost:5000`
   - `http://localhost:5173` (Frontend dev server)
6. **Authorized redirect URIs**:
   - Exact matching is required by Google. Add:
     - `http://localhost:5000/api/oauth/google/callback`
   - *Note: Google strictly forbids wildcards or arbitrary URL fragments in redirect URIs.*
7. Click **Create**.
8. Copy the **Client ID** and **Client Secret**.

---

## 4. Backend Environment Configuration

Add the credentials to your local `Backend/.env` file:

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5000/api/oauth/google/callback
```

> [!CAUTION]
> - Never commit `Backend/.env` to Git.
> - Never log `GOOGLE_CLIENT_SECRET` or any tokens.
> - Google Cloud Console credentials must strictly match the `GOOGLE_REDIRECT_URI`.

