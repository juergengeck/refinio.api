// Test new entry point detection
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
console.log('__filename:', __filename);
console.log('process.argv[1]:', process.argv[1]);
console.log('resolve(process.argv[1]):', resolve(process.argv[1]));
console.log('Match:', __filename === resolve(process.argv[1]));

if (__filename === resolve(process.argv[1])) {
  console.log('✅ Entry point detected - would start server');
} else {
  console.log('❌ Entry point NOT detected - would NOT start server');
}
