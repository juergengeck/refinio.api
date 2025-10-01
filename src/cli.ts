#!/usr/bin/env node
/**
 * CLI wrapper for refinio.api server
 */

import { startApiServer } from './index.js';

// Parse basic command line arguments
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];

  if (key === '--secret' || key === '-s') {
    process.env.REFINIO_INSTANCE_SECRET = value;
  } else if (key === '--directory' || key === '-d') {
    process.env.REFINIO_INSTANCE_DIRECTORY = value;
  } else if (key === '--port' || key === '-p') {
    process.env.REFINIO_API_PORT = value;
  } else if (key === '--email' || key === '-e') {
    process.env.REFINIO_INSTANCE_EMAIL = value;
  }
}

// Start the server
console.log('Starting refinio.api server...');
startApiServer()
  .then(() => {
    console.log(`Refinio API server started successfully`);
    console.log(`Port: ${process.env.REFINIO_API_PORT || 49498}`);
    console.log(`Directory: ${process.env.REFINIO_INSTANCE_DIRECTORY || './storage'}`);
  })
  .catch(err => {
    console.error('Failed to start server:', err.message);
    console.error(err.stack);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down refinio.api server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down refinio.api server...');
  process.exit(0);
});
