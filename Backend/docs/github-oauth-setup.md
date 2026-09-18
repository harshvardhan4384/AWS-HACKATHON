# GitHub OAuth 2.0 Setup Guide for Re:COVER

This document describes the exact configuration needed in GitHub to register and connect a GitHub OAuth App with the Re:COVER platform.

---

## 1. Register a GitHub OAuth App

1. Sign in to your [GitHub account](https://github.com/).
2. In the upper-right corner of any page, click your profile photo, then click **Settings**.
3. In the left sidebar, click **Developer settings**.
4. In the left sidebar, click **OAuth Apps**.
5. Click **New OAuth App** (or **Register a new application**).

---

## 2. Configure Application Details

Fill in the registration form:

*   **Application name**: `Re:COVER Security Platform`
*   **Homepage URL**: `http://localhost:5173` (Frontend) or `http://localhost:5000`
*   **Application description**: `Autonomous Digital Security & Recovery Platform integration`
*   **Authorization callback URL**:
    ```
    http://localhost:5000/api/oauth/github/callback
    ```
    *(Note: GitHub strictly checks the callback URL. For local development, this exact URI must match `GITHUB_REDIRECT_URI` in your `.env` file.)*
*   **Enable Device Flow**: Leave unchecked.

Click **Register application**.

---

## 3. Generate Client Secret

1. Under **Client secrets**, click **Generate a new client secret**.
2. Copy the **Client ID** and the generated **Client Secret** immediately.
3. *Note: Never commit client secrets to Git or expose them in client-side code.*

---

## 4. Backend Environment Configuration

Add the credentials to your local `Backend/.env` file:

```env
GITHUB_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REDIRECT_URI=http://localhost:5000/api/oauth/github/callback
```

---

## 5. Security & Scope Boundaries in Re:COVER

*   **Requested Initial Scopes**:
    *   `read:user`
    *   `user:email`
*   **Permanent Account Identifier**:
    *   Re:COVER records the immutable numeric GitHub account `id` (e.g., `583231`) as `ConnectedAccount.providerAccountId`.
    *   Re:COVER **never** relies on the mutable GitHub `login` (username) or private emails as the primary external identifier.
*   **Token Revocation**:
    *   Disconnecting a GitHub account calls GitHub's `DELETE /applications/{client_id}/grant` endpoint using HTTP Basic Authentication, revoking all tokens issued to that user for Re:COVER.

