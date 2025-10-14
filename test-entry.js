// Test entry point detection
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);
console.log('file:// + argv[1]:', `file://${process.argv[1]}`);
console.log('Match:', import.meta.url === `file://${process.argv[1]}`);

// Import the actual module
import('./dist/index.js').catch(console.error);
