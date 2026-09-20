'use strict';

const { getDb } = require('../lib/db');

async function migrate() {
  console.log('--- Starting Account Security Database Migration ---');
  const db = getDb();
  const rt = db.runtime();

  // 1. Add columns to "user" table
  console.log('1. Adding columns to "user" table if not present...');
  const userColumns = [
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorSecretEncrypted" TEXT`,
  ];

  for (const sql of userColumns) {
    await rt.driver.execute({ sql, params: [] });
  }

  // 2. Create "otpChallenge" table
  console.log('2. Creating "otpChallenge" table if not present...');
  const createOtpChallengeSql = `
    CREATE TABLE IF NOT EXISTS "otpChallenge" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" TEXT REFERENCES "user"("id") ON DELETE CASCADE,
      "email" VARCHAR(255) NOT NULL,
      "purpose" VARCHAR(50) NOT NULL,
      "codeHash" VARCHAR(255) NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "attemptCount" INT NOT NULL DEFAULT 0,
      "maxAttempts" INT NOT NULL DEFAULT 5,
      "consumedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await rt.driver.execute({ sql: createOtpChallengeSql, params: [] });

  // Indexes for otpChallenge
  console.log('3. Creating indexes for "otpChallenge"...');
  await rt.driver.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_otp_email_purpose" ON "otpChallenge" ("email", "purpose")`, params: [] });
  await rt.driver.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_otp_user_id" ON "otpChallenge" ("userId")`, params: [] });
  await rt.driver.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_otp_expires_at" ON "otpChallenge" ("expiresAt")`, params: [] });

  // 3. Create "twoFactorRecoveryCode" table
  console.log('4. Creating "twoFactorRecoveryCode" table if not present...');
  const createRecoveryCodeSql = `
    CREATE TABLE IF NOT EXISTS "twoFactorRecoveryCode" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "codeHash" VARCHAR(255) NOT NULL,
      "usedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await rt.driver.execute({ sql: createRecoveryCodeSql, params: [] });

  // Indexes for twoFactorRecoveryCode
  console.log('5. Creating indexes for "twoFactorRecoveryCode"...');
  await rt.driver.execute({ sql: `CREATE INDEX IF NOT EXISTS "idx_recovery_user_id" ON "twoFactorRecoveryCode" ("userId")`, params: [] });

  console.log('--- Migration Completed Successfully ---');
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };

