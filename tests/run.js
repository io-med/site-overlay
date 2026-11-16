// Runs every *.test.js in this folder, one after another. Usage: npm test
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs
  .readdirSync(__dirname)
  .filter((name) => name.endsWith('.test.js'))
  .sort();
let failed = 0;
for (const file of files) {
  console.log(`\n== ${file}`);
  const { status } = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (status !== 0) failed++;
}
console.log(
  failed ? `\n${failed} of ${files.length} test files failed` : `\nall ${files.length} test files passed`,
);
process.exit(failed ? 1 : 0);
