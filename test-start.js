// Direct test of startApiServer
console.log('Starting refinio.api test...');

import('./dist/index.js').then(() => {
  console.log('Module loaded');
}).catch(err => {
  console.error('Failed to load module:', err);
  process.exit(1);
});
