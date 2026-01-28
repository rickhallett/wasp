/**
 * Database Adapter
 *
 * Provides a unified interface for SQLite that works with both:
 * - Bun (bun:sqlite)
 * - Node.js (better-sqlite3)
 */

export interface DbAdapter {
  exec(sql: string): void;
  prepare(sql: string): StatementAdapter;
  close(): void;
}

export interface StatementAdapter {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

// Detect runtime
const isBun = typeof (globalThis as any).Bun !== 'undefined';

let createDatabase: (path: string) => DbAdapter;

if (isBun) {
  // Bun runtime
  createDatabase = (path: string): DbAdapter => {
    const { Database } = require('bun:sqlite');
    const db = new Database(path);

    return {
      exec: (sql: string) => db.exec(sql),
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        return {
          run: (...params: any[]) => stmt.run(...params),
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params),
        };
      },
      close: () => db.close(),
    };
  };
} else {
  // Node.js runtime
  createDatabase = (path: string): DbAdapter => {
    const Database = require('better-sqlite3');
    const db = new Database(path);

    return {
      exec: (sql: string) => db.exec(sql),
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        return {
          run: (...params: any[]) => stmt.run(...params),
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params),
        };
      },
      close: () => db.close(),
    };
  };
}

export { createDatabase, isBun };
