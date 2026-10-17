# Local directory import

Run `node server/directory-server.cjs`, then open [directory setup](http://127.0.0.1:8878/). The standalone utility binds to `127.0.0.1` and accepts only loopback hosts. Keep it local; it is a development setup utility, not a hosted admin interface.

## Connect Google

The setup page walks through enabling the [Admin SDK API](https://console.cloud.google.com/apis/library/admin.googleapis.com), configuring [OAuth consent](https://console.cloud.google.com/auth/overview), and creating a [web OAuth client](https://console.cloud.google.com/auth/clients). Its exact redirect URI is:

```text
http://127.0.0.1:8878/oauth/callback
```

Save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` through the setup page, or add them to the ignored local `.env`. The form updates only those two keys and preserves existing AI keys. Secrets are never rendered or logged. No cloud project or OAuth client is provisioned automatically.

The page shows the exact local configuration path and names any missing variables beside the sign-in button. The button remains actionable: if configuration is incomplete, clicking it displays a visible explanation. After editing `.env`, save the file and select **Recheck saved .env**, or try sign-in again. Credentials are read from disk on every request; no server restart is required. The page reports presence only, never credential values.

The requested scopes are `openid email profile` and `https://www.googleapis.com/auth/admin.directory.user.readonly`. OAuth uses authorization code flow, a browser-bound expiring one-use state and PKCE. After the token exchange, Google's authenticated userinfo must establish a verified `berkeley.edu` email and hosted domain. The hosted-domain login hint alone does not authorize access.

The importer requests `users.list` for `berkeley.edu`, follows pagination, and retains only the canonical `DirectoryPerson` fields. A Berkeley email by itself does not confer authority to list university accounts: the authenticated account needs appropriate Workspace directory permissions. If Google returns a permission denial, the page explains the restriction and offers the mock fallback. Nothing attempts to bypass university policy. See Google's [users.list reference](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/list) and [web OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).

Error guidance distinguishes a disabled API (`SERVICE_DISABLED`), project access configuration (`accessNotConfigured`), explicit insufficient OAuth scopes (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`), and rate/quota limits. An otherwise unexplained 403 remains a general denial; it does not establish that the account lacks administrator privileges or that scopes are missing. Only allowlisted reason identifiers affect the message. Upstream error text, project/account metadata and diagnostic URLs are never shown or logged. Google's [Directory API troubleshooting](https://developers.google.com/workspace/admin/reseller/v1/support/directory_api_common_errors) and [API error reasons](https://github.com/googleapis/googleapis/blob/master/google/api/error_reason.proto) document these signals.

## Saved format

`data/directory-roster.json` is a local import artifact, excluded from Git. It contains:

```json
{
  "Source": "mock",
  "Domain": "berkeley.edu",
  "SyncedAt": "2026-10-17T00:00:00.000Z",
  "DirectoryPeople": [
    {
      "ID": "mock-directory-1",
      "PrimaryEmail": "mock.alex@berkeley.edu",
      "DisplayName": "Alex (demo person)",
      "PersonID": null,
      "Suspended": false
    }
  ]
}
```

`Source` is either `google-directory` or `mock`; the page labels mock data explicitly. Directory membership remains separate from registration and completed onboarding. Imports have null `PersonID`; the application must link a verified account identity to its own profile deliberately. A whole Berkeley domain roster does not prove membership in a smaller organization or group.

`readRosterFile()` exported from `server/directory-server.cjs` validates and reads this wrapper. The backend can import its `DirectoryPeople` array. A fresh import replaces the roster artifact; it does not overwrite registered application profiles. Saving is atomic and file permissions are restricted to the local user. Access tokens, authorization codes and passwords are not included. The importer requests online access and discards tokens after the current operation, so each later sync needs fresh Google sign-in. Existing saved data is preserved when Google fails.

Real roster data and `.env` stay out of Git even though the importer implementation and fictional test fixtures belong in the repository. No directory data is sent to an AI provider. The setup UI validates local Host, same-origin form submission and CSRF tokens; callback validation binds OAuth state to the initiating browser session. This does not make the local utility a production authentication provider.

## Checks

`node --test tests/directory.test.cjs` exercises pagination and field minimization, denied access, account-domain validation, OAuth state and code exchange, host/origin/CSRF protection, mock persistence and credentials preservation. All Google requests are injected fakes; tests never use real API credentials or directory accounts.

Native forms from embedded browsers may omit the Origin header. These requests still require the same browser session and its unpredictable CSRF token; supplied origins must be the local directory service, and explicit cross-site requests are rejected.
