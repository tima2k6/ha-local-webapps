const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('official screensaver imports resolve directly in the browser', () => {
    const root = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const modules = [...html.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)];
    const imports = modules.flatMap(m => [...m[1].matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(m => m[1]));
    assert.equal(imports.length, 3);
    for (const source of imports) {
        assert.ok(source.startsWith('./'), `Browser import must be relative: ${source}`);
        assert.ok(fs.existsSync(path.join(root, source.split('?')[0])), `Missing module: ${source}`);
    }
    assert.ok(!html.includes('mockups/'));
});
