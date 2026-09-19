export const INITIAL_INCIDENTS = [
  {
    id: 'inc-1',
    refCode: 'INC-8891-ALPHA',
    title: 'Rogue SSH Key & Exfiltration Spike on prod-vault-s3',
    severity: 'critical',
    status: 'investigating',
    provider: 'aws',
    timestamp: '2 mins ago',
    actor: {
      ip: '194.26.29.114',
      location: 'Bucharest, RO (Tor Exit Node)',
      userAgent: 'aws-cli/2.15.15 Python/3.11.8 Linux/6.2.0',
      fingerprint: 'fp_9921_c2_botnet'
    },
    targetResource: 'arn:aws:s3:::prod-vault-customer-data-01',
    mitreTactic: 'TA0010 Exfiltration',
    mitreTechnique: 'T1530 Data from Cloud Storage Object',
    aiConfidence: 98.4,
    summary: 'Attacker compromised dev GitHub PAT, pushed unauthorized deploy key, assumed IAM role "Deployer-Prod-Admin", and attempted batch S3 GetObject requests.',
    blastRadiusCount: 5,
    rollbackPlanId: 'rec-1',
    rawPayload: {
      eventVersion: '1.08',
      userIdentity: {
        type: 'AssumedRole',
        principalId: 'AROA4729104EXAMPLE:auto-deploy',
        arn: 'arn:aws:sts::123456789012:assumed-role/Deployer-Prod-Admin/session',
        accountId: '123456789012'
      },
      eventTime: '2026-09-18T11:15:32Z',
      eventSource: 's3.amazonaws.com',
      eventName: 'GetObject',
      awsRegion: 'us-east-1',
      sourceIPAddress: '194.26.29.114',
      requestParameters: {
        bucketName: 'prod-vault-customer-data-01',
        key: 'db_backups/2026-09-customer_pii.tar.gz'
      },
      responseElements: null
    },
    evidenceChain: [
      { time: '11:12:04 UTC', event: 'GitHub PAT Leaked in CI log #9482', severity: 'medium', detail: 'Token ghp_998x... committed to public fork repo' },
      { time: '11:13:20 UTC', event: 'Unauthorized SSH Key Added', severity: 'high', detail: 'Key ed25519-AAAAC3... added from IP 194.26.29.114' },
      { time: '11:14:02 UTC', event: 'IAM Role Assumed (Deployer-Prod-Admin)', severity: 'critical', detail: 'sts:AssumeRole called with forged external ID' },
      { time: '11:15:32 UTC', event: 'Mass S3 Download Request Triggered', severity: 'critical', detail: '14.2 GB request blocked by RE:COVER anomaly interceptor' }
    ]
  },
  {
    id: 'inc-2',
    refCode: 'INC-7740-OKTA',
    title: 'Credential Stuffing & MFA Fatigue Bypass Attempt',
    severity: 'high',
    status: 'mitigating',
    provider: 'okta',
    timestamp: '14 mins ago',
    actor: {
      ip: '45.154.255.88',
      location: 'Frankfurt, DE (Proxy)',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      fingerprint: 'fp_okta_spray_42'
    },
    targetResource: 'user:sarah.connor@enterprise.io',
    mitreTactic: 'TA0006 Credential Access',
    mitreTechnique: 'T1110.003 Brute Force: Password Spraying',
    aiConfidence: 94.2,
    summary: '28 rapid push notifications triggered within 90 seconds followed by login from unexpected ASN. Session auto-isolated and step-up WebAuthn triggered.',
    blastRadiusCount: 2,
    rollbackPlanId: 'rec-2',
    rawPayload: {
      eventType: 'user.authentication.verify',
      outcome: { result: 'CHALLENGE_EXHAUSTED' },
      actor: { id: 'usr9941a8', alternateId: 'sarah.connor@enterprise.io' },
      client: { ipAddress: '45.154.255.88', zone: 'UNKNOWN_PROXY' }
    },
    evidenceChain: [
      { time: '10:58:10 UTC', event: 'Password spray matched hash', severity: 'medium', detail: 'Okta auth success from anomalous IP' },
      { time: '10:59:00 UTC', event: '28x MFA Push notifications generated', severity: 'high', detail: 'MFA prompt fatigue detected' },
      { time: '11:00:15 UTC', event: 'Autonomous Quarantine Engaged', severity: 'high', detail: 'Session tokens revoked and user suspended' }
    ]
  },
  {
    id: 'inc-3',
    refCode: 'INC-6120-GSUITE',
    title: 'OAuth Permission Elevation on Google Drive Workspace',
    severity: 'medium',
    status: 'contained',
    provider: 'google',
    timestamp: '42 mins ago',
    actor: {
      ip: '185.220.101.5',
      location: 'Amsterdam, NL (Tor)',
      userAgent: 'Go-http-client/1.1',
      fingerprint: 'fp_oauth_phish_09'
    },
    targetResource: 'oauth:app_991204_cloud_sync_pro',
    mitreTactic: 'TA0003 Persistence',
    mitreTechnique: 'T1556.007 Hybrid Identity: OAuth Apps',
    aiConfidence: 91.0,
    summary: 'Malicious 3rd-party OAuth application requested broad drive.readonly and mail.send scopes. App grant automatically revoked across tenant.',
    blastRadiusCount: 3,
    rollbackPlanId: 'rec-3',
    rawPayload: {
      kind: 'admin#reports#activity',
      id: { uniqueQualifier: '99482190' },
      events: [{ type: 'token', name: 'authorize', parameters: [{ name: 'app_name', value: 'CloudSync Assistant' }] }]
    },
    evidenceChain: [
      { time: '10:20:00 UTC', event: 'User clicked OAuth consent link', severity: 'low', detail: 'Phishing campaign detected via telemetry' },
      { time: '10:21:10 UTC', event: 'Excessive scope request flagged', severity: 'medium', detail: 'drive.readonly + gmail.send requested' },
      { time: '10:21:12 UTC', event: 'Autonomous Token Blacklist', severity: 'medium', detail: 'App ID 991204 banned tenant-wide' }
    ]
  },
  {
    id: 'inc-4',
    refCode: 'INC-5519-GH',
    title: 'Stale Personal Access Token Committing to Release Branch',
    severity: 'low',
    status: 'resolved',
    provider: 'github',
    timestamp: '3 hours ago',
    actor: {
      ip: '198.51.100.24',
      location: 'San Francisco, US',
      userAgent: 'git/2.43.0',
      fingerprint: 'fp_git_developer_laptop'
    },
    targetResource: 'repo:enterprise-org/payment-gateway-service',
    mitreTactic: 'TA0005 Defense Evasion',
    mitreTechnique: 'T1550 Use Alternate Authentication Material',
    aiConfidence: 88.5,
    summary: 'Expired PAT used to push commits bypass branch protection. Token rotated and developer re-authenticated via Hardware FIDO2 key.',
    blastRadiusCount: 1,
    rollbackPlanId: 'rec-4',
    rawPayload: {
      action: 'push',
      ref: 'refs/heads/main',
      sender: { login: 'dev-alex-99' },
      repository: { full_name: 'enterprise-org/payment-gateway-service' }
    },
    evidenceChain: [
      { time: '08:14:00 UTC', event: 'Push with PAT older than 90 days', severity: 'low', detail: 'Compliance policy violation' },
      { time: '08:14:05 UTC', event: 'Branch lock temporarily engaged', severity: 'low', detail: 'Re-auth completed successfully' }
    ]
  }
];

export const INITIAL_ATTACK_NODES = [
  {
    id: 'node-threat',
    label: 'Threat Actor (194.26.29.114)',
    sublabel: 'Tor Exit / C2 Origin',
    type: 'actor',
    x: 440,
    y: 50,
    status: 'compromised',
    provider: 'threat',
    riskScore: 99,
    metadata: {
      ip: '194.26.29.114',
      lastActive: 'Just now',
      owner: 'Unknown APT / Botnet'
    }
  },
  {
    id: 'node-github',
    label: 'GitHub Developer (alex.v)',
    sublabel: 'Compromised Session & PAT',
    type: 'account',
    x: 440,
    y: 190,
    status: 'compromised',
    provider: 'github',
    riskScore: 92,
    metadata: {
      arn: 'gh:user:alex.vance',
      lastActive: '3m ago',
      owner: 'DevOps Core Team'
    }
  },
  {
    id: 'node-ssh',
    label: 'Rogue Deploy Key (ed25519)',
    sublabel: 'Unauthorized Provisioning',
    type: 'credential',
    x: 440,
    y: 330,
    status: 'compromised',
    provider: 'github',
    riskScore: 88,
    metadata: {
      arn: 'gh:key:ed25519-AAAAC3NzaC1...',
      permissions: ['repo:write', 'workflow:trigger']
    }
  },
  {
    id: 'node-repo',
    label: 'Repo: infra-terraform-core',
    sublabel: 'Modified CI/CD Workflow',
    type: 'repo',
    x: 440,
    y: 470,
    status: 'warning',
    provider: 'github',
    riskScore: 76,
    metadata: {
      arn: 'gh:repo:enterprise/infra-terraform-core',
      exposedItems: 14
    }
  },
  {
    id: 'node-iam',
    label: 'IAM Role: Deployer-Prod-Admin',
    sublabel: 'sts:AssumeRole Privilege Spurt',
    type: 'role',
    x: 440,
    y: 610,
    status: 'compromised',
    provider: 'aws',
    riskScore: 95,
    metadata: {
      arn: 'arn:aws:iam::123456789012:role/Deployer-Prod-Admin',
      permissions: ['s3:*', 'ec2:Describe*', 'kms:Decrypt*']
    }
  },
  {
    id: 'node-s3',
    label: 'AWS S3: prod-vault-customer-01',
    sublabel: 'Mass Download Target (14.2 GB)',
    type: 'bucket',
    x: 270,
    y: 750,
    status: 'contained',
    provider: 'aws',
    riskScore: 65,
    metadata: {
      arn: 'arn:aws:s3:::prod-vault-customer-01',
      exposedItems: 142000,
      owner: 'Prod Database Team'
    }
  },
  {
    id: 'node-circleci',
    label: 'CircleCI OAuth Webhook',
    sublabel: 'Cross-SaaS Sync Pipe',
    type: 'oauth',
    x: 610,
    y: 750,
    status: 'safe',
    provider: 'cloudflare',
    riskScore: 20,
    metadata: {
      arn: 'oauth:circleci:integration_492',
      permissions: ['build:read']
    }
  }
];

export const INITIAL_ATTACK_EDGES = [
  { id: 'e1', source: 'node-threat', target: 'node-github', label: 'Session Hijack 03:42 UTC', status: 'threat', animated: true },
  { id: 'e2', source: 'node-github', target: 'node-ssh', label: 'Provisioned Unauthorized', status: 'threat', animated: true },
  { id: 'e3', source: 'node-ssh', target: 'node-repo', label: 'Injected Malicious Hook', status: 'threat', animated: false },
  { id: 'e4', source: 'node-repo', target: 'node-iam', label: 'Assumed High-Privilege Role', status: 'warning', animated: true },
  { id: 'e5a', source: 'node-iam', target: 'node-s3', label: 'Mass Exfil Blocked', status: 'warning', animated: false },
  { id: 'e5b', source: 'node-iam', target: 'node-circleci', label: 'Secondary Pivot Attempt', status: 'nominal', animated: false }
];

export const INITIAL_TELEMETRY_LOGS = [
  {
    id: 'log-1',
    timestamp: '11:15:32.401',
    level: 'SEC_CRIT',
    service: 'AWS CloudTrail',
    eventType: 's3:GetObjectBatch',
    actor: 'Deployer-Prod-Admin',
    sourceIp: '194.26.29.114',
    target: 's3://prod-vault-customer-01',
    status: 'INTERCEPTED',
    payload: { bytesRequested: 14200000000, anomalyScore: 0.992, decision: 'AUTONOMOUS_DENY' }
  },
  {
    id: 'log-2',
    timestamp: '11:14:02.189',
    level: 'ALERT',
    service: 'AWS STS',
    eventType: 'sts:AssumeRole',
    actor: 'alex.vance@enterprise.io',
    sourceIp: '194.26.29.114',
    target: 'arn:aws:iam::role/Deployer-Prod-Admin',
    status: 'ANOMALY',
    payload: { externalIdMismatch: true, unmanagedGeo: 'Romania' }
  },
  {
    id: 'log-3',
    timestamp: '11:13:20.940',
    level: 'WARN',
    service: 'GitHub Enterprise Audit',
    eventType: 'public_key.create',
    actor: 'alex.vance',
    sourceIp: '194.26.29.114',
    target: 'github.com/enterprise/keys',
    status: 'ALLOW',
    payload: { keyType: 'ssh-ed25519', title: 'temp-ci-worker' }
  },
  {
    id: 'log-4',
    timestamp: '11:10:05.112',
    level: 'INFO',
    service: 'Okta System Log',
    eventType: 'user.session.start',
    actor: 'alex.vance@enterprise.io',
    sourceIp: '194.26.29.114',
    target: 'sso.enterprise.io',
    status: 'ALLOW',
    payload: { authMethod: 'SessionCookie', deviceKnown: false }
  },
  {
    id: 'log-5',
    timestamp: '11:08:44.209',
    level: 'INFO',
    service: 'Google Workspace Audit',
    eventType: 'drive.file_share',
    actor: 'finance-bot@enterprise.io',
    sourceIp: '10.0.12.44',
    target: 'Financial_Q3_Summary.xlsx',
    status: 'ALLOW',
    payload: { permissions: 'view_internal_only' }
  }
];

export const INITIAL_CONNECTED_ACCOUNTS = [
  {
    id: 'acc-aws',
    name: 'AWS Production Cloud',
    type: 'aws',
    accountNumber: '1234-5678-9012 (us-east-1)',
    status: 'warning',
    identitiesCount: 184,
    resourcesCount: 1420,
    lastSync: 'Just now',
    healthScore: 78,
    tokenExpiry: 'Auto-refreshed (IAM Role)',
    securityControls: {
      mfaEnforced: true,
      leastPrivilege: true,
      anomalyShield: true,
      autoRollback: true
    }
  },
  {
    id: 'acc-gh',
    name: 'GitHub Enterprise Hub',
    type: 'github',
    accountNumber: 'org:enterprise-core',
    status: 'warning',
    identitiesCount: 420,
    resourcesCount: 88,
    lastSync: '1 min ago',
    healthScore: 82,
    tokenExpiry: 'PATs Enforced (90d max)',
    securityControls: {
      mfaEnforced: true,
      leastPrivilege: false,
      anomalyShield: true,
      autoRollback: true
    }
  },
  {
    id: 'acc-google',
    name: 'Google Workspace Enterprise',
    type: 'google',
    accountNumber: 'enterprise.com (Cloud Identity)',
    status: 'connected',
    identitiesCount: 1420,
    resourcesCount: 4500,
    lastSync: '2 mins ago',
    healthScore: 98,
    tokenExpiry: 'OAuth 2.0 Synced',
    securityControls: {
      mfaEnforced: true,
      leastPrivilege: true,
      anomalyShield: true,
      autoRollback: true
    }
  },
  {
    id: 'acc-okta',
    name: 'Okta Identity Fabric',
    type: 'okta',
    accountNumber: 'enterprise.okta.com',
    status: 'connected',
    identitiesCount: 1650,
    resourcesCount: 94,
    lastSync: '30s ago',
    healthScore: 95,
    tokenExpiry: 'Adaptive SSO Active',
    securityControls: {
      mfaEnforced: true,
      leastPrivilege: true,
      anomalyShield: true,
      autoRollback: true
    }
  },
  {
    id: 'acc-slack',
    name: 'Slack Enterprise Grid',
    type: 'slack',
    accountNumber: 'enterprise.slack.com',
    status: 'connected',
    identitiesCount: 890,
    resourcesCount: 310,
    lastSync: '5 mins ago',
    healthScore: 99,
    tokenExpiry: 'DLP Guardian Active',
    securityControls: {
      mfaEnforced: true,
      leastPrivilege: true,
      anomalyShield: true,
      autoRollback: false
    }
  },
  {
    id: 'acc-azure',
    name: 'Microsoft Entra ID (Azure)',
    type: 'azure',
    accountNumber: 'tenant:9901-4412-ee9',
    status: 'connected',
    identitiesCount: 620,
    resourcesCount: 430,
    lastSync: '4 mins ago',
    healthScore: 96,
    tokenExpiry: 'Conditional Access Active',
    securityControls: {
      mfaEnforced: true,
      leastPrivilege: true,
      anomalyShield: true,
      autoRollback: true
    }
  }
];

export const INITIAL_RECOVERY_PLAYBOOKS = [
  {
    id: 'rec-1',
    incidentRef: 'INC-8891-ALPHA',
    title: 'Autonomous Rollback & Key Revocation for AWS Vault',
    severity: 'critical',
    status: 'pending_approval',
    automated: false,
    estimatedRollbackSeconds: 12,
    createdAt: '2 mins ago',
    targetEnvironment: 'AWS Production (us-east-1) & GitHub Enterprise',
    steps: [
      {
        id: 's1',
        order: 1,
        name: 'Revoke Rogue GitHub Deploy Key',
        target: 'github:enterprise/infra-terraform-core',
        action: 'DELETE /repos/enterprise/infra-terraform-core/keys/ed25519-AAAAC3...',
        status: 'pending',
        output: 'Target SSH key registered at 11:13 UTC queued for instant deletion.'
      },
      {
        id: 's2',
        order: 2,
        name: 'Terminate Compromised STS Sessions',
        target: 'aws:iam::role/Deployer-Prod-Admin',
        action: 'aws sts revoke-all-sessions --role-arn arn:aws:iam::123456789012:role/Deployer-Prod-Admin',
        status: 'pending',
        output: 'Inline session revocation policy ready to attach.'
      },
      {
        id: 's3',
        order: 3,
        name: 'Quarantine IP & Attach WAF Deny Rule',
        target: 'aws:wafv2::ip-set/Blacklisted-C2',
        action: 'aws wafv2 update-ip-set --addresses 194.26.29.114/32',
        status: 'pending',
        output: 'IP matched 3 other known malicious probes. Ready to broadcast.'
      },
      {
        id: 's4',
        order: 4,
        name: 'Restore Clean Branch State in GitHub',
        target: 'github:enterprise/infra-terraform-core',
        action: 'git push --force origin HEAD~1:main',
        status: 'pending',
        output: 'Clean commit hash #a8f102c verified against baseline SHA.'
      },
      {
        id: 's5',
        order: 5,
        name: 'Issue Cryptographic Zero-Trust Token Reissue',
        target: 'okta:user/alex.vance',
        action: 'okta.users.reauthenticate --require-webauthn',
        status: 'pending',
        output: 'Hardware security key prompt dispatched to user.'
      }
    ],
    executionLogs: [
      '[PRE-FLIGHT] Dry run completed with 0 errors.',
      '[DEPENDENCY CHECK] AWS STS & GitHub API endpoints responding nominal (latency 42ms).',
      '[READY] Awaiting 1-Click Human Authorization.'
    ]
  },
  {
    id: 'rec-2',
    incidentRef: 'INC-7740-OKTA',
    title: 'Okta Session Destruction & Step-Up WebAuthn Lock',
    severity: 'high',
    status: 'in_progress',
    automated: true,
    estimatedRollbackSeconds: 4,
    createdAt: '14 mins ago',
    targetEnvironment: 'Okta Workforce Fabric',
    steps: [
      {
        id: 's1',
        order: 1,
        name: 'Invalidate All Active Okta Web & App Sessions',
        target: 'okta:user/sarah.connor',
        action: 'okta.users.clearSessions(id=usr9941a8)',
        status: 'completed',
        executionTime: '0.4s',
        output: '3 active sessions across desktop and mobile cleared.'
      },
      {
        id: 's2',
        order: 2,
        name: 'Lock Password & Flag Stolen Credential',
        target: 'okta:user/sarah.connor',
        action: 'okta.users.expirePassword(id=usr9941a8)',
        status: 'completed',
        executionTime: '0.6s',
        output: 'Password reset link sent to out-of-band verified phone.'
      },
      {
        id: 's3',
        order: 3,
        name: 'Enforce Hardware FIDO2 Authenticator',
        target: 'okta:policy/strict-fido2',
        action: 'okta.policies.assign(usr9941a8, policy_id="strict-fido2")',
        status: 'executing',
        output: 'Awaiting biometric key confirmation...'
      }
    ],
    executionLogs: [
      '[AUTO-ENGAGE] Anomaly threshold exceeded (Score 94.2 > 85.0).',
      '[STEP 1 SUCCESS] Cleared 3 tokens.',
      '[STEP 2 SUCCESS] Password state set to EXPIRED.',
      '[STEP 3] Hardware key verification in flight.'
    ]
  }
];

