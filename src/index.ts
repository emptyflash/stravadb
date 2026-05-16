#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth.js';
import { putCommand } from './commands/put.js';
import { getCommand } from './commands/get.js';
import { listCommand } from './commands/list.js';
import { deleteCommand } from './commands/delete.js';
import { infoCommand } from './commands/info.js';
import { serveCommand } from './commands/serve.js';

const program = new Command();

program
  .name('stravadb')
  .description('Store arbitrary data encoded as Strava routes')
  .version('0.1.0');

program
  .command('auth')
  .description('Authenticate with Strava via OAuth2')
  .option('-p, --port <port>', 'Local server port for OAuth callback', '3000')
  .action(async (opts) => {
    try {
      await authCommand(parseInt(opts.port, 10));
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('put')
  .description('Store a file as an encoded Strava route')
  .argument('<key>', 'Key name for the stored data')
  .argument('<file>', 'Path to the file to store')
  .action(async (key, file) => {
    try {
      await putCommand(key, file);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('get')
  .description('Retrieve stored data')
  .argument('<key>', 'Key name of the stored data')
  .option('-o, --output <file>', 'Output file path (default: stdout)')
  .action(async (key, opts) => {
    try {
      await getCommand(key, opts.output);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all stored keys')
  .action(async () => {
    try {
      await listCommand();
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('delete')
  .description('Delete stored data')
  .argument('<key>', 'Key name of the stored data')
  .action(async (key) => {
    try {
      await deleteCommand(key);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show metadata about stored data')
  .argument('<key>', 'Key name of the stored data')
  .action(async (key) => {
    try {
      await infoCommand(key);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start a local HTTP server to browse stored files')
  .option('-p, --port <port>', 'Port to listen on', '8080')
  .option('--no-cache', 'Always fetch from Strava, skip local cache')
  .action(async (opts) => {
    try {
      await serveCommand(parseInt(opts.port, 10), !opts.cache);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parse();
