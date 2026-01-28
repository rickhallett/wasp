import { startServer } from '../server/index.js';
import { isInitialized } from '../db/client.js';

export function runServe(options: { port?: number }): void {
  if (!isInitialized()) {
    console.error('wasp is not initialized. Run `wasp init` first.');
    process.exit(1);
  }

  const port = options.port || 3847;
  startServer(port);
}
