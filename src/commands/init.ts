import { initSchema, isInitialized, getDataDir } from '../db/client.js';

export function runInit(force: boolean = false): void {
  if (isInitialized() && !force) {
    console.log('wasp is already initialized.');
    console.log(`Data directory: ${getDataDir()}`);
    console.log('Use --force to reinitialize.');
    return;
  }

  initSchema();
  console.log('wasp initialized successfully.');
  console.log(`Data directory: ${getDataDir()}`);
  console.log('');
  console.log('Next steps:');
  console.log('  wasp add "+440123456789" --name "Your Name" --trust sovereign');
  console.log('  wasp list');
  console.log('  wasp serve');
}
