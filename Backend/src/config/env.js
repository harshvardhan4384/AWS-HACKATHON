
'use strict';

require('dotenv').config();

const port = parseInt(process.env.PORT, 10) || 5000;
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;

// In production, OAUTH_TOKEN_ENCRYPTION_KEY must be configured explicitly
const devDefaultKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const oauthTokenEncryptionKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY || (isProduction ? null : devDefaultKey);

const config = {
  port,
  nodeEnv,
  isProduction,
  // Never log this value — contains credentials
  databaseUrl: process.env.DATABASE_URL || null,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  serverUrl,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'recover_session',
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS, 10) || 7,
  // AES-256-GCM encryption key for connected account tokens
  oauthTokenEncryptionKey,
  oauthStateTtlMinutes: parseInt(process.env.OAUTH_STATE_TTL_MINUTES, 10) || 10,
  // Google OAuth 2.0 configuration (Never log client secret or tokens)
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || `${serverUrl}/api/oauth/google/callback`,
  // GitHub OAuth configuration (Never log client secret or tokens)
  githubClientId: process.env.GITHUB_CLIENT_ID || null,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || null,
  githubRedirectUri: process.env.GITHUB_REDIRECT_URI || `${serverUrl}/api/oauth/github/callback`,
  // Detection Engine thresholds — all deterministic, no ML/LLM
  detectionUnfamiliarLoginLookbackDays: parseInt(process.env.DETECTION_UNFAMILIAR_LOGIN_LOOKBACK_DAYS, 10) || 30,
  detectionRapidCredentialWindowMinutes: parseInt(process.env.DETECTION_RAPID_CREDENTIAL_WINDOW_MINUTES, 10) || 10,
  detectionTakeoverWindowMinutes: parseInt(process.env.DETECTION_TAKEOVER_WINDOW_MINUTES, 10) || 30,
  detectionCrossAccountWindowMinutes: parseInt(process.env.DETECTION_CROSS_ACCOUNT_WINDOW_MINUTES, 10) || 30,
  riskScoreMax: parseInt(process.env.RISK_SCORE_MAX, 10) || 100,
  // AWS Bedrock & AI Investigation settings (Task 10)
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  bedrockModelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  bedrockMaxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS, 10) || 4096,
  bedrockTemperature: parseFloat(process.env.BEDROCK_TEMPERATURE) || 0.1,
  bedrockTimeoutMs: parseInt(process.env.BEDROCK_TIMEOUT_MS, 10) || 30000,
  aiMaxToolCalls: parseInt(process.env.AI_MAX_TOOL_CALLS, 10) || 10,
  aiMaxGraphSteps: parseInt(process.env.AI_MAX_GRAPH_STEPS, 10) || 20,
  aiMaxInvestigationTimeMs: parseInt(process.env.AI_MAX_INVESTIGATION_TIME_MS, 10) || 60000,
  aiMaxToolResultItems: parseInt(process.env.AI_MAX_TOOL_RESULT_ITEMS, 10) || 100,
};

module.exports = config;
