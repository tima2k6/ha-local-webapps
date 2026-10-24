const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('official screensaver imports resolve directly in the browser', () => {
    const root = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const modules = [...html.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)];
    const imports = modules.flatMap(m => [...m[1].matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(m => m[1]));
    assert.equal(imports.length, 12);
    for (const source of imports) {
        assert.ok(source.startsWith('./'), `Browser import must be relative: ${source}`);
        assert.ok(fs.existsSync(path.join(root, source.split('?')[0])), `Missing module: ${source}`);
    }
    assert.ok(!html.includes('mockups/'));
});

test('no CSS comment closes its style block early', () => {
    // A "</style>" inside a CSS comment ends the block in HTML, and the rest of the CSS shows
    // on screen as text (happened 2026-10-23, caught before deploy).
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g))
        for (const [comment] of css.matchAll(/\/\*[\s\S]*?\*\//g))
            assert.ok(!comment.includes('</'), `CSS comment contains "</": ${comment.slice(0, 80)}`);
});

test('every module imports the same flight-backdrop version as the page', () => {
    // A layer on an older ?v= loads a second copy of the module (2026-10-24: v38 beside v39).
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const want = /flight-backdrop\.js\?v=(\d+)/.exec(html)[1];
    for (const f of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))) {
        const m = /flight-backdrop\.js\?v=(\d+)/.exec(fs.readFileSync(path.join(root, 'js', f), 'utf8'));
        if (m) assert.equal(m[1], want, `${f} imports flight-backdrop v=${m[1]}, the page v=${want}`);
    }
});
