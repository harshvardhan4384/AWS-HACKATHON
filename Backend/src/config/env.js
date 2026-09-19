
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
  // Neo4j Identity / Attack Graph settings (Task 11)
  // Never log neo4jPassword or return it through APIs
  neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4jUsername: process.env.NEO4J_USERNAME || 'neo4j',
  neo4jPassword: process.env.NEO4J_PASSWORD || '',
  neo4jDatabase: process.env.NEO4J_DATABASE || 'neo4j',
  neo4jMaxConnectionLifetimeMs: parseInt(process.env.NEO4J_MAX_CONNECTION_LIFETIME_MS, 10) || 3600000,
  neo4jConnectionTimeoutMs: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT_MS, 10) || 5000,
  // Blast Radius Engine settings (Task 12)
  blastRadiusMaxDepth: parseInt(process.env.BLAST_RADIUS_MAX_DEPTH, 10) || 5,
  blastRadiusMaxNodes: parseInt(process.env.BLAST_RADIUS_MAX_NODES, 10) || 500,
  blastRadiusMaxPaths: parseInt(process.env.BLAST_RADIUS_MAX_PATHS, 10) || 100,
  blastRadiusTimeoutMs: parseInt(process.env.BLAST_RADIUS_TIMEOUT_MS, 10) || 10000,
  // Recovery Planner + Action Executor settings (Task 13)
  recoveryMaxActionsPerPlan: parseInt(process.env.RECOVERY_MAX_ACTIONS_PER_PLAN, 10) || 10,
  recoveryMaxExecutionTimeMs: parseInt(process.env.RECOVERY_MAX_EXECUTION_TIME_MS, 10) || 30000,
  recoveryAuthorizationTtlMinutes: parseInt(process.env.RECOVERY_AUTHORIZATION_TTL_MINUTES, 10) || 60,
  // Policy + Approval Engine settings (Task 14)
  policyVersion: process.env.POLICY_VERSION || 'v1',
  approvalExpiryMinutes: parseInt(process.env.APPROVAL_EXPIRY_MINUTES, 10) || 30,
  // Verification & Persistence Engine settings (Task 15)
  verificationTimeoutMs: parseInt(process.env.VERIFICATION_TIMEOUT_MS, 10) || 10000,
  verificationEventWindowMinutes: parseInt(process.env.VERIFICATION_EVENT_WINDOW_MINUTES, 10) || 30,
  maxVerificationChecks: parseInt(process.env.MAX_VERIFICATION_CHECKS, 10) || 50,
  maxPostRecoveryEvents: parseInt(process.env.MAX_POST_RECOVERY_EVENTS, 10) || 100,
  maxPersistenceItems: parseInt(process.env.MAX_PERSISTENCE_ITEMS, 10) || 100,
  maxRecoveryCyclesPerIncident: parseInt(process.env.MAX_RECOVERY_CYCLES_PER_INCIDENT, 10) || 3,
  // Notifications + WebSockets settings (Task 16)
  wsHeartbeatIntervalMs: parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS, 10) || 30000,
  wsConnectionTimeoutMs: parseInt(process.env.WS_CONNECTION_TIMEOUT_MS, 10) || 10000,
  wsMaxConnectionsPerUser: parseInt(process.env.WS_MAX_CONNECTIONS_PER_USER, 10) || 5,
  wsMaxTotalConnections: parseInt(process.env.WS_MAX_TOTAL_CONNECTIONS, 10) || 1000,
  wsMaxMessagesPerMinute: parseInt(process.env.WS_MAX_MESSAGES_PER_MINUTE, 10) || 120,
  wsMaxMessageBytes: parseInt(process.env.WS_MAX_MESSAGE_BYTES, 10) || 16384,
  maxNotificationPayloadBytes: parseInt(process.env.MAX_NOTIFICATION_PAYLOAD_BYTES, 10) || 16384,
  notificationRetentionDays: parseInt(process.env.NOTIFICATION_RETENTION_DAYS, 10) || 30,
  maxNotificationPageSize: parseInt(process.env.MAX_NOTIFICATION_PAGE_SIZE, 10) || 100,
};

module.exports = config;


