'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const oauthRoutes = require('./routes/oauth.routes');
const eventRoutes = require('./routes/event.routes');
const detectionRoutes = require('./routes/detection.routes');
const incidentRoutes = require('./routes/incident.routes');
const agentRunRoutes = require('./routes/agentRun.routes');
const graphRoutes = require('./routes/graph.routes');
const blastRadiusRoutes = require('./routes/blastRadius.routes');
const accountRoutes = require('./routes/account.routes');
const recoveryRoutes = require('./routes/recovery.routes');
const approvalRoutes = require('./routes/approval.routes');
const policyRoutes = require('./routes/policy.routes');
const notificationRoutes = require('./routes/notification.routes');

// Initialize detection rule registry with all 8 default rules at startup
const { initDefaultRules } = require('./detection/detection.service');
initDefaultRules();

// Initialize tool registry with all 11 default read-only tools at startup
const { initDefaultTools } = require('./ai/tools/initTools');
initDefaultTools();

// Non-blocking initialization of Neo4j schema constraints if available
const { initGraphSchema } = require('./infrastructure/neo4j/neo4j.schema');
initGraphSchema().catch(() => {});

const app = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// ── Body & Cookie parsing ────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/events', eventRoutes);
// Detection sub-routes under /api/events (/:id/analyze, /:id/findings)
app.use('/api/events', detectionRoutes);
// Incident routes
// Incident routes (including /:id/investigate, /:id/investigation)
app.use('/api/incidents', incidentRoutes);
// AgentRun routes
app.use('/api/agent-runs', agentRunRoutes);
// Graph routes (Identity & Attack Graph)
app.use('/api/graph', graphRoutes);
// Account routes (including blast-radius)
app.use('/api/accounts', accountRoutes);
// Blast Radius routes
app.use('/api/blast-radius', blastRadiusRoutes);
// Recovery Action routes (execute, get single action, policy-evaluate, approval-request)
app.use('/api/recovery-actions', recoveryRoutes);
// Approval routes (list, approve, reject)
app.use('/api/approvals', approvalRoutes);
// Policy routes (preferences)
app.use('/api/policy', policyRoutes);
// Notification routes (list, unread, read, read-all)
app.use('/api/notifications', notificationRoutes);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use(notFound);

// ── Centralized error handler ─────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
