'use strict';

const crypto = require('crypto');
const BaseEventAdapter = require('./base.eventAdapter');
const { EVENT_TYPES, PROVIDERS, normalizeEventType } = require('../../utils/taxonomy');
const { redactSensitive } = require('../../utils/redaction');

/**
 * Event adapter for AWS CloudTrail / GuardDuty security events,
 * including deterministic simulation for Hackathon demonstration.
 */
class AwsEventAdapter extends BaseEventAdapter {
  constructor() {
    super(PROVIDERS.AWS);
  }

  /**
   * Maps AWS CloudTrail / IAM event names to canonical Re:COVER event types.
   *
   * @param {string} rawType
   * @returns {string} Canonical event type
   */
  mapEventType(rawType) {
    if (!rawType || typeof rawType !== 'string') return EVENT_TYPES.UNKNOWN;
    const lower = rawType.toLowerCase().trim();

    if (
      lower.includes('consolelogin') ||
      lower.includes('switchrole') ||
      lower === 'login'
    ) {
      return EVENT_TYPES.LOGIN;
    }

    if (lower.includes('assumerole') || lower.includes('session_created')) {
      return EVENT_TYPES.SESSION_CREATED;
    }

    if (
      lower.includes('createaccesskey') ||
      lower.includes('createloginprofile') ||
      lower.includes('token_created')
    ) {
      return EVENT_TYPES.TOKEN_CREATED;
    }

    if (
      lower.includes('deleteaccesskey') ||
      lower.includes('deactivatesmfa') ||
      lower.includes('token_revoked')
    ) {
      return EVENT_TYPES.TOKEN_REVOKED;
    }

    if (
      lower.includes('passwordpolicy') ||
      lower.includes('updateaccountpasswordpolicy') ||
      lower.includes('putaccountpasswordpolicy') ||
      lower.includes('createmfadevice') ||
      lower.includes('deletemfadevice') ||
      lower.includes('security_setting')
    ) {
      return EVENT_TYPES.SECURITY_SETTING_CHANGED;
    }

    return normalizeEventType(rawType);
  }

  /**
   * Generates a realistic simulated AWS CloudTrail payload for demonstration and testing.
   *
   * @param {'CONSOLE_LOGIN'|'ACCESS_KEY_CREATED'|'ACCESS_KEY_REVOKED'|'SECURITY_SETTING_CHANGED'|'SESSION_CREATED'} [scenario='CONSOLE_LOGIN']
   * @param {object} [options]
   * @returns {object} Simulated AWS CloudTrail payload
   */
  generateSimulatedPayload(scenario = 'CONSOLE_LOGIN', options = {}) {
    const timestamp = options.timestamp || new Date().toISOString();
    const eventId = options.eventId || `sim_aws_${crypto.randomUUID()}`;
    const accountId = options.accountId || '123456789012';
    const userName = options.userName || 'security-operator';
    const region = options.region || 'us-east-1';
    const sourceIp = options.sourceIp || '198.51.100.24';

    const baseRecord = {
      eventVersion: '1.08',
      isSimulated: true,
      userIdentity: {
        type: 'IAMUser',
        principalId: `AIDA${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
        arn: `arn:aws:iam::${accountId}:user/${userName}`,
        accountId,
        userName,
      },
      eventTime: timestamp,
      eventID: eventId,
      awsRegion: region,
      sourceIPAddress: sourceIp,
      userAgent: options.userAgent || 'AWS-Console/1.0 (Mozilla/5.0 Security-Auditor)',
    };

    switch (scenario) {
      case 'ACCESS_KEY_CREATED':
        return {
          ...baseRecord,
          eventSource: 'iam.amazonaws.com',
          eventName: 'CreateAccessKey',
          requestParameters: {
            userName,
          },
          responseElements: {
            accessKey: {
              accessKeyId: `AKIA${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
              status: 'Active',
              createDate: timestamp,
            },
          },
        };

      case 'ACCESS_KEY_REVOKED':
        return {
          ...baseRecord,
          eventSource: 'iam.amazonaws.com',
          eventName: 'DeleteAccessKey',
          requestParameters: {
            userName,
            accessKeyId: options.accessKeyId || 'AKIAIOSFODNN7EXAMPLE',
          },
          responseElements: null,
        };

      case 'SECURITY_SETTING_CHANGED':
        return {
          ...baseRecord,
          eventSource: 'iam.amazonaws.com',
          eventName: 'UpdateAccountPasswordPolicy',
          requestParameters: {
            minimumPasswordLength: 8,
            requireSymbols: false,
            requireNumbers: true,
            requireUppercaseCharacters: true,
            requireLowercaseCharacters: true,
            allowUsersToChangePassword: true,
          },
          responseElements: null,
        };

      case 'SESSION_CREATED':
        return {
          ...baseRecord,
          eventSource: 'sts.amazonaws.com',
          eventName: 'AssumeRole',
          requestParameters: {
            roleArn: `arn:aws:iam::${accountId}:role/SecurityIncidentResponder`,
            roleSessionName: `session_${Date.now()}`,
          },
          responseElements: {
            assumedRoleUser: {
              assumedRoleId: `AROA${crypto.randomBytes(8).toString('hex').toUpperCase()}:session`,
              arn: `arn:aws:sts::${accountId}:assumed-role/SecurityIncidentResponder/session`,
            },
          },
        };

      case 'CONSOLE_LOGIN':
      default:
        return {
          ...baseRecord,
          eventSource: 'signin.amazonaws.com',
          eventName: 'ConsoleLogin',
          errorMessage: options.errorMessage || null,
          responseElements: {
            ConsoleLogin: options.success !== false ? 'Success' : 'Failure',
          },
          additionalEventData: {
            LoginTo: 'https://console.aws.amazon.com/console/home',
            MFAUsed: options.mfaUsed ? 'Yes' : 'No',
          },
        };
    }
  }

  /**
   * Normalizes an AWS raw event (simulated or real) into canonical schema.
   *
   * @param {object} rawPayload
   * @param {object} [context]
   * @returns {object} Canonical normalized event
   */
  normalize(rawPayload, context = {}) {
    const validation = this.validate(rawPayload);
    if (!validation.valid) {
      throw new Error(`Invalid AWS event payload: ${validation.errors.join(', ')}`);
    }

    const isSimulated = Boolean(rawPayload.isSimulated || context.isSimulated);

    // Extract event name / type
    const rawEventType =
      rawPayload.eventName ||
      rawPayload.eventType ||
      rawPayload.type ||
      'ConsoleLogin';

    const canonicalEventType = this.mapEventType(rawEventType);

    // Extract timestamp
    let occurredAt = null;
    const rawTime =
      rawPayload.eventTime ||
      rawPayload.timestamp ||
      rawPayload.occurredAt ||
      rawPayload.time;

    if (rawTime) {
      const parsed = new Date(rawTime);
      if (!isNaN(parsed.getTime())) {
        occurredAt = parsed.toISOString();
      }
    }
    if (!occurredAt) {
      occurredAt = new Date().toISOString();
    }

    // Extract source IP
    const sourceIp =
      rawPayload.sourceIPAddress ||
      rawPayload.sourceIp ||
      rawPayload.ipAddress ||
      null;

    // Extract native provider event ID
    const nativeId =
      rawPayload.eventID ||
      rawPayload.eventId ||
      rawPayload.id;

    const providerEventId = this.deriveProviderEventId(
      rawPayload,
      canonicalEventType,
      occurredAt,
      sourceIp,
      typeof nativeId === 'string' ? nativeId : null
    );

    // Device metadata from User-Agent
    let deviceMetadata = null;
    if (rawPayload.deviceMetadata && typeof rawPayload.deviceMetadata === 'object') {
      deviceMetadata = redactSensitive(rawPayload.deviceMetadata);
    } else if (rawPayload.userAgent) {
      deviceMetadata = redactSensitive({
        userAgent: rawPayload.userAgent,
      });
    }

    // Location metadata from awsRegion
    let locationMetadata = null;
    if (rawPayload.locationMetadata && typeof rawPayload.locationMetadata === 'object') {
      locationMetadata = redactSensitive(rawPayload.locationMetadata);
    } else if (rawPayload.awsRegion) {
      locationMetadata = redactSensitive({
        awsRegion: rawPayload.awsRegion,
      });
    }

    const severity = this.resolveSeverity(canonicalEventType, rawPayload.severity);

    // Clean details
    const rawDetails = {
      eventSource: rawPayload.eventSource,
      eventName: rawPayload.eventName,
      awsRegion: rawPayload.awsRegion,
      userIdentity: rawPayload.userIdentity,
      requestParameters: rawPayload.requestParameters,
      responseElements: rawPayload.responseElements,
      additionalEventData: rawPayload.additionalEventData,
      errorMessage: rawPayload.errorMessage,
    };

    const eventData = this.formatEventData(rawEventType, rawDetails, isSimulated);

    return {
      provider: this._provider,
      eventType: canonicalEventType,
      providerEventId,
      occurredAt,
      receivedAt: new Date().toISOString(),
      severity,
      sourceIp: sourceIp ? String(sourceIp) : null,
      deviceMetadata,
      locationMetadata,
      eventData,
    };
  }
}

module.exports = AwsEventAdapter;

