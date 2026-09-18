#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6f849a92a6a75552f2eaa949f2329c0b7e894280e2da6547237f46940e6deded/contract';
import endContract from '../../snapshots/6f849a92a6a75552f2eaa949f2329c0b7e894280e2da6547237f46940e6deded/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/964f1b02caadd7954d02f029a806a5aea34be87723a67d02040d1ccda37d2eee/contract';
import startContract from '../../snapshots/964f1b02caadd7954d02f029a806a5aea34be87723a67d02040d1ccda37d2eee/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addUnique({
        schema: 'public',
        table: 'incident',
        constraint: 'incident_id_userId_key',
        columns: ['id', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'recoveryAction',
        constraint: 'recoveryAction_id_incidentId_key',
        columns: ['id', 'incidentId'],
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'auditLog',
        constraint: 'auditLog_userId_fkey',
        kind: 'foreignKey',
      }),
      this.dropNotNull({
        schema: 'public',
        table: 'auditLog',
        column: 'userId',
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auditLog',
        foreignKey: {
          name: 'auditLog_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'approval',
        constraint: 'approval_recoveryActionId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'approval',
        constraint: 'approval_incidentId_fkey',
        kind: 'foreignKey',
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'approval',
        foreignKey: {
          name: 'approval_incidentId_userId_fkey',
          columns: ['incidentId', 'userId'],
          references: { schema: 'public', table: 'incident', columns: ['id', 'userId'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'approval',
        foreignKey: {
          name: 'approval_recoveryActionId_incidentId_fkey',
          columns: ['recoveryActionId', 'incidentId'],
          references: { schema: 'public', table: 'recoveryAction', columns: ['id', 'incidentId'] },
          onDelete: 'cascade',
        },
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_incidentId_userId_idx_093a35a7',
        columns: ['incidentId', 'userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_recoveryActionId_incidentId_idx_e99d4b98',
        columns: ['recoveryActionId', 'incidentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'approval',
        index: 'approval_recoveryActionId_status_idx_745c24c6',
        columns: ['recoveryActionId', 'status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);