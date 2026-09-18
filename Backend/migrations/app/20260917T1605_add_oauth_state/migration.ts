#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/20f88f44ba8d76a64bb1f9ba246ec446ed22f494e090e6b26efe3156afcfae8a/contract';
import endContract from '../../snapshots/20f88f44ba8d76a64bb1f9ba246ec446ed22f494e090e6b26efe3156afcfae8a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/48dfa512e31f5d50b4c3228a040aa4f1e8926143649ee3a2cca1df2e51036d70/contract';
import startContract from '../../snapshots/48dfa512e31f5d50b4c3228a040aa4f1e8926143649ee3a2cca1df2e51036d70/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, checkExpression, col, fn, primaryKey, unique } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'oAuthState',
        columns: [
          col('codeVerifier', 'text', {
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('provider', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('stateHash', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('usedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['stateHash']),
          checkExpression(
            'oAuthState_provider_check_9bb84945',
            "\"provider\" IN ('GOOGLE', 'GITHUB', 'AWS')",
          ),
        ],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oAuthState',
        foreignKey: {
          name: 'oAuthState_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.createIndex({
        schema: 'public',
        table: 'oAuthState',
        index: 'oAuthState_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oAuthState',
        index: 'oAuthState_userId_idx_a489d58a',
        columns: ['userId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
