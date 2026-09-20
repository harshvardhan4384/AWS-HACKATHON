'use strict';

/**
 * OAuth & Identity Provider Capability Matrix for Re:COVER.
 *
 * Explicitly tracks which capabilities are implemented, planned, or unknown/unverified.
 */
const CAPABILITY_STATES = {
  AVAILABLE: 'AVAILABLE',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  ERROR: 'ERROR',
  STALE: 'STALE',
};

const PROVIDER_CAPABILITIES = {
  GOOGLE: {
    name: 'Google',
    protocol: 'OAuth 2.0 + OpenID Connect',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
    userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    supportsPkce: true,
    pkceMethod: 'S256',
    supportsRefreshTokens: true,
    refreshTokenTrigger: 'access_type=offline&prompt=consent',
    supportsTokenRevocation: true,
    plannedTask: 'Task 6',
    implementationStatus: 'IMPLEMENTED_TASK_6',
    eventIngestionStatus: 'FOUNDATION_TASK_8',
    securityOverview: {
      twoFactorAuth: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        reason: 'Google OpenID Connect does not expose 2FA status for consumer accounts. Available for Google Workspace domains via Directory Admin SDK.',
      },
      loginHistory: {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        reason: 'Google does not expose personal login telemetry via User OAuth API. Audit logging requires Google Workspace Admin SDK Reports API.',
      },
      deviceSessions: {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        reason: 'Endpoint and device session management requires Google Workspace Endpoint Management or enterprise MDM.',
      },
      sshKeys: {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        reason: 'SSH public keys are not applicable to Google Identity.',
      },
      authorizedApps: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        reason: 'Enumeration of third-party OAuth grants requires Google Workspace Admin SDK Token API.',
      },
      tokenRevocation: {
        status: CAPABILITY_STATES.AVAILABLE,
        method: 'POST https://oauth2.googleapis.com/revoke',
      },
      tokenRefresh: {
        status: CAPABILITY_STATES.AVAILABLE,
        trigger: 'access_type=offline',
      },
    },
  },
  GITHUB: {
    name: 'GitHub',
    protocol: 'OAuth 2.0 (Web Application Flow)',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    revocationEndpoint: 'https://api.github.com/applications/{client_id}/grant',
    userInfoEndpoint: 'https://api.github.com/user',
    userEmailsEndpoint: 'https://api.github.com/user/emails',
    supportsPkce: true,
    pkceMethod: 'S256',
    supportsRefreshTokens: 'CONDITIONAL', // When expiring tokens are enabled in GitHub App / OAuth App
    supportsTokenRevocation: true, // Application grant deletion via DELETE /applications/{client_id}/grant
    plannedTask: 'Task 7',
    implementationStatus: 'IMPLEMENTED_TASK_7',
    eventIngestionStatus: 'FOUNDATION_TASK_8',
    securityOverview: {
      twoFactorAuth: {
        status: CAPABILITY_STATES.AVAILABLE,
        source: 'GET /user (two_factor_authentication flag)',
      },
      loginHistory: {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        reason: 'GitHub does not expose personal login audit logs via User OAuth API. Organization audit logs require GitHub Enterprise.',
      },
      deviceSessions: {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        reason: 'Device telemetry is not accessible via GitHub User OAuth API.',
      },
      sshKeys: {
        status: CAPABILITY_STATES.AVAILABLE,
        source: 'GET /users/{username}/keys',
      },
      authorizedApps: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        reason: 'Authorized application management requires fine-grained GitHub App administration permissions.',
      },
      tokenRevocation: {
        status: CAPABILITY_STATES.AVAILABLE,
        method: 'DELETE /applications/{client_id}/grant',
      },
      tokenRefresh: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        reason: 'Standard GitHub OAuth apps issue non-expiring bearer tokens unless GitHub App token expiration is configured.',
      },
    },
  },
  AWS: {
    name: 'Amazon Web Services',
    protocol: 'IAM / STS AssumeRole / SigV4',
    authorizationEndpoint: null,
    tokenEndpoint: null,
    revocationEndpoint: null,
    userInfoEndpoint: null,
    supportsPkce: false,
    pkceMethod: 'N/A',
    supportsRefreshTokens: false,
    supportsTokenRevocation: 'IAM_POLICY_REVOKE_STS',
    plannedTask: 'Task 8',
    implementationStatus: 'IAM_ROLE_SIMULATION',
    eventIngestionStatus: 'SIMULATED_TASK_8',
    notes: 'AWS authentication uses STS AssumeRole / IAM credentials. Activity event ingestion supported via CloudTrail normalization and deterministic event simulation.',
    securityOverview: {
      twoFactorAuth: {
        status: CAPABILITY_STATES.AVAILABLE,
        source: 'IAM User MFA / STS Session MFA Evaluation',
      },
      loginHistory: {
        status: CAPABILITY_STATES.AVAILABLE,
        source: 'AWS CloudTrail ConsoleLogin events',
      },
      deviceSessions: {
        status: CAPABILITY_STATES.NOT_SUPPORTED,
        reason: 'AWS IAM tracks API access and Console sessions; hardware device telemetry requires AWS WorkSpaces or AWS Client VPN.',
      },
      sshKeys: {
        status: CAPABILITY_STATES.AVAILABLE,
        source: 'EC2 Key Pairs / AWS CodeCommit SSH Keys',
      },
      authorizedApps: {
        status: CAPABILITY_STATES.NOT_AVAILABLE,
        reason: 'IAM Identity Center (SSO) applications require AWS SSO Admin API.',
      },
      tokenRevocation: {
        status: CAPABILITY_STATES.AVAILABLE,
        method: 'Attach AWSRevokeOlderSessions IAM inline policy',
      },
    },
  },
};

module.exports = {
  CAPABILITY_STATES,
  PROVIDER_CAPABILITIES,
};
