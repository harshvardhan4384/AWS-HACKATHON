#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/48dfa512e31f5d50b4c3228a040aa4f1e8926143649ee3a2cca1df2e51036d70/contract';
import endContract from '../../snapshots/48dfa512e31f5d50b4c3228a040aa4f1e8926143649ee3a2cca1df2e51036d70/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6f849a92a6a75552f2eaa949f2329c0b7e894280e2da6547237f46940e6deded/contract';
import startContract from '../../snapshots/6f849a92a6a75552f2eaa949f2329c0b7e894280e2da6547237f46940e6deded/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, unique } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('passwordHash', 'text', {
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.createTable({
        schema: 'public',
        table: 'session',
        columns: [
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
          col('ipAddress', 'text', {
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('lastUsedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('sessionTokenHash', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('userAgent', 'text', {
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('userId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          unique(['sessionTokenHash']),
        ],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'session',
        foreignKey: {
          name: 'session_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.createIndex({
        schema: 'public',
        table: 'session',
        index: 'session_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'session',
        index: 'session_userId_idx_a489d58a',
        columns: ['userId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);