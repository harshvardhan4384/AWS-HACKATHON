'use strict';

/**
 * OAuth & Identity Provider Capability Matrix for Re:COVER.
 *
 * Explicitly tracks which capabilities are implemented, planned, or unknown/unverified.
 */
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
  },
};

module.exports = {
  PROVIDER_CAPABILITIES,
};
