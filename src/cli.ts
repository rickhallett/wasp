#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { runInit } from './commands/init.js';
import { runAdd } from './commands/add.js';
import { runRemove } from './commands/remove.js';
import { runList } from './commands/list.js';
import { runCheck } from './commands/check.js';
import { runLog } from './commands/log.js';
import { runServe } from './commands/serve.js';
import { runReview, showFirstTimeContacts } from './commands/review.js';
import { isInitialized, initSchema, closeDb } from './db/client.js';

// Import version from package.json (ESM compatible)
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

program
  .name('wasp')
  .description('Security whitelist layer for Moltbot and agentic systems')
  .version(VERSION);

program
  .command('init')
  .description('Initialize wasp database')
  .option('-f, --force', 'Reinitialize even if already initialized')
  .action((options) => {
    runInit(options.force);
  });

program
  .command('add <identifier>')
  .description('Add a contact to the whitelist')
  .option('-p, --platform <platform>', 'Platform (whatsapp, telegram, email, discord, slack, signal)', 'whatsapp')
  .option('-t, --trust <level>', 'Trust level (sovereign, trusted, limited)', 'trusted')
  .option('-n, --name <name>', 'Contact name')
  .option('--notes <notes>', 'Notes about this contact')
  .action((identifier, options) => {
    ensureInitialized();
    runAdd(identifier, options);
  });

program
  .command('remove <identifier>')
  .description('Remove a contact from the whitelist')
  .option('-p, --platform <platform>', 'Platform', 'whatsapp')
  .action((identifier, options) => {
    ensureInitialized();
    runRemove(identifier, options.platform);
  });

program
  .command('list')
  .description('List all contacts')
  .option('-p, --platform <platform>', 'Filter by platform')
  .option('-t, --trust <level>', 'Filter by trust level')
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    ensureInitialized();
    runList(options);
  });

program
  .command('check <identifier>')
  .description('Check if a contact is allowed')
  .option('-p, --platform <platform>', 'Platform', 'whatsapp')
  .option('-j, --json', 'Output as JSON')
  .option('-q, --quiet', 'Exit code only, no output')
  .action((identifier, options) => {
    ensureInitialized();
    runCheck(identifier, options);
  });

program
  .command('log')
  .description('View audit log')
  .option('-l, --limit <number>', 'Number of entries to show', '50')
  .option('-d, --denied', 'Show only denied entries')
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    ensureInitialized();
    runLog({ ...options, limit: parseInt(options.limit) });
  });

program
  .command('serve')
  .description('Start HTTP server for Moltbot integration')
  .option('-p, --port <number>', 'Port to listen on', '3847')
  .action((options) => {
    ensureInitialized();
    runServe({ port: parseInt(options.port) });
  });

program
  .command('review')
  .description('Review quarantined messages and first-time contacts')
  .option('--approve <identifier>', 'Approve sender and release messages')
  .option('--deny <identifier>', 'Block sender and delete messages')
  .option('-i, --interactive', 'Interactive review mode')
  .action(async (options) => {
    ensureInitialized();
    await runReview(options);
  });

program
  .command('blocked')
  .description('Show recently blocked contacts')
  .option('-l, --limit <number>', 'Number to show', '20')
  .action((options) => {
    ensureInitialized();
    showFirstTimeContacts(parseInt(options.limit));
  });

function ensureInitialized(): void {
  if (!isInitialized()) {
    console.log('wasp is not initialized. Initializing now...');
    initSchema();
    console.log('');
  }
}

program.parseAsync().then(() => {
  closeDb();
  process.exit(0);
}).catch((err) => {
  console.error(err);
  closeDb();
  process.exit(1);
});
