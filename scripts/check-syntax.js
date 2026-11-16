// Syntax-check every first-party .js file with `node --check`.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', 'dist', '.git']);
const files = [];
(function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(ent.name)) continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.js')) files.push(p);
    }
})(root);

let failed = 0;
for (const f of files) {
    try {
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
        console.log('ok  ', path.relative(root, f));
    } catch (e) {
        failed++;
        console.error('FAIL', path.relative(root, f), '\n' + String(e.stderr || e.message));
    }
}
console.log(`${files.length - failed}/${files.length} files passed`);
process.exit(failed ? 1 : 0);
