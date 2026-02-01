#!/usr/bin/env node

import { program } from 'commander';
import { runAdd } from './commands/add.js';
import { runCanary } from './commands/canary.js';
import { runCheck } from './commands/check.js';
import { runInit } from './commands/init.js';
import { runList } from './commands/list.js';
import { runLog } from './commands/log.js';
import { runRemove } from './commands/remove.js';
import { runReview, showFirstTimeContacts } from './commands/review.js';
import { runServe } from './commands/serve.js';
import { closeDb, initSchema, isInitialized } from './db/client.js';
import { log } from './logger.js';

// Version injected at build time via --define
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

program
  .name('wasp')
  .description('Security whitelist layer for Moltbot and agentic systems')
  .version(VERSION)
  .option('-j, --json', 'Output as JSON (applies to all commands)');

program
  .command('init')
  .description('Initialize wasp database')
  .option('-f, --force', 'Reinitialize even if already initialized')
  .action((options) => {
    const globalOpts = program.opts();
    runInit(options.force, { json: globalOpts.json });
  });

// TODO: trace checl
program
  .command('add <identifier>')
  .description('Add a contact to the whitelist')
  .option(
    '-p, --platform <platform>',
    'Platform (whatsapp, telegram, email, discord, slack, signal)',
    'whatsapp'
  )
  .option('-t, --trust <level>', 'Trust level (sovereign, trusted, limited)', 'trusted')
  .option('-n, --name <name>', 'Contact name')
  .option('--notes <notes>', 'Notes about this contact')
  .action((identifier, options) => {
    log('debug', 'commander:add()');
    ensureInitialized();
    const globalOpts = program.opts();
    runAdd(identifier, { ...options, json: globalOpts.json });
  });

// TODO: trace check
program
  .command('remove <identifier>')
  .description('Remove a contact from the whitelist')
  .option('-p, --platform <platform>', 'Platform', 'whatsapp')
  .action((identifier, options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    runRemove(identifier, options.platform, { json: globalOpts.json });
  });

program
  .command('list')
  .description('List all contacts')
  .option('-p, --platform <platform>', 'Filter by platform')
  .option('-t, --trust <level>', 'Filter by trust level')
  .action((options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    runList({ ...options, json: globalOpts.json || options.json });
  });

// TODO: trace check
program
  .command('check <identifier>')
  .description('Check if a contact is allowed')
  .option('-p, --platform <platform>', 'Platform', 'whatsapp')
  .option('-q, --quiet', 'Exit code only, no output')
  .action((identifier, options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    runCheck(identifier, { ...options, json: globalOpts.json || options.json });
  });

// TODO: trace check
program
  .command('log')
  .description('View audit log')
  .option('-l, --limit <number>', 'Number of entries to show', '50')
  .option('-d, --denied', 'Show only denied entries')
  .action((options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    runLog({
      ...options,
      limit: parseInt(options.limit, 10),
      json: globalOpts.json || options.json,
    });
  });

program
  .command('serve')
  .description('Start HTTP server for Moltbot integration')
  .option('-p, --port <number>', 'Port to listen on', '3847')
  .action((options) => {
    if (!isInitialized()) {
      console.error('wasp is not initialized. Run "wasp init" first.');
      process.exit(1);
    }
    runServe({ port: parseInt(options.port, 10) });
  });

program
  .command('review')
  .description('Review quarantined messages and first-time contacts')
  .option('--approve <identifier>', 'Approve sender and release messages')
  .option('--deny <identifier>', 'Block sender and delete messages')
  .option('-i, --interactive', 'Interactive review mode')
  .action(async (options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    await runReview({ ...options, json: globalOpts.json });
  });

program
  .command('blocked')
  .description('Show recently blocked contacts')
  .option('-l, --limit <number>', 'Number to show', '20')
  .action((options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    showFirstTimeContacts(parseInt(options.limit, 10), { json: globalOpts.json });
  });

program
  .command('canary')
  .description('View prompt injection telemetry')
  .option('-s, --stats', 'Show aggregate statistics')
  .option('-c, --clear', 'Clear old entries')
  .option('-d, --days <number>', 'Days to keep when clearing (default: 30)', '30')
  .option('-l, --limit <number>', 'Number of entries to show', '20')
  .action((options) => {
    ensureInitialized();
    const globalOpts = program.opts();
    runCanary({
      ...options,
      days: parseInt(options.days, 10),
      limit: parseInt(options.limit, 10),
      json: globalOpts.json,
    });
  });

function ensureInitialized(): void {
  if (!isInitialized()) {
    console.log('wasp is not initialized. Initializing now...');
    initSchema();
    console.log('');
  }
}

program
  .parseAsync()
  .then(() => {
    closeDb();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    closeDb();
    process.exit(1);
  });
