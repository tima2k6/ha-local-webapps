const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/ambience.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('each season has its accent, and a new season eases in over its first ten days', async () => {
    const { seasonAccent } = await modulePromise;
    assert.equal(seasonAccent(new Date(2026, 6, 20)), '#5fc9b4');           // summer: the original teal
    assert.equal(seasonAccent(new Date(2026, 9, 20)), '#dd9566');           // fall
    assert.equal(seasonAccent(new Date(2027, 0, 20)), '#7fb2e5');           // winter
    assert.equal(seasonAccent(new Date(2027, 3, 20)), '#93cf7e');           // spring
    assert.equal(seasonAccent(new Date(2026, 8, 1, 0)), '#5fc9b4');         // Sep 1: still summer's color
    const mid = seasonAccent(new Date(2026, 8, 6));
    assert.notEqual(mid, '#5fc9b4'); assert.notEqual(mid, '#dd9566');
    assert.equal(seasonAccent(new Date(2026, 8, 11)), '#dd9566');
    assert.equal(seasonAccent(new Date(2026, 9, 20), 'winter'), '#7fb2e5'); // ?season= preview
});

test('golden hour peaks at sunset and is off outside its window', async () => {
    const { goldenness } = await modulePromise;
    const set = new Date(2026, 9, 9, 18, 32);
    const at = min => goldenness(new Date(+set + min * 60e3), set);
    assert.equal(at(0), 1);
    assert.equal(at(-46), 0);
    assert.equal(at(26), 0);
    assert.ok(at(-20) > 0 && at(-20) < 1);
    assert.ok(at(10) > 0 && at(10) < 1);
    assert.equal(goldenness(new Date(), null), 0);
});

test('holidays fall on the right days, Thanksgiving included', async () => {
    const { holidayOf } = await modulePromise;
    assert.equal(holidayOf(new Date(2026, 9, 23)), null);
    assert.equal(holidayOf(new Date(2026, 9, 24)), 'halloween');
    assert.equal(holidayOf(new Date(2026, 9, 31)), 'halloween');
    assert.equal(holidayOf(new Date(2026, 6, 4)), 'july4');
    assert.equal(holidayOf(new Date(2026, 10, 26)), 'thanksgiving');         // 4th Thursday, 2026
    assert.equal(holidayOf(new Date(2027, 10, 25)), 'thanksgiving');
    assert.equal(holidayOf(new Date(2026, 10, 19)), null);
    assert.equal(holidayOf(new Date(2026, 11, 24)), 'christmas');
    assert.equal(holidayOf(new Date(2027, 0, 1)), 'newyear');
});

test('birthday titles from the Family calendar give a name', async () => {
    const { occasionOf } = await modulePromise;
    assert.equal(occasionOf('Sam’s birthday'), 'Sam');
    assert.equal(occasionOf('Liz bday'), 'Liz');
    assert.equal(occasionOf("Mason's Birthday"), 'Mason');
    assert.equal(occasionOf('Liam’s birthday'), 'Liam');
    assert.equal(occasionOf('Anniversary'), 'anniversary');
    assert.equal(occasionOf('Picture day'), null);
    assert.equal(occasionOf('Birthday party prep'), null);
});

test('moon age matches known full and new moons', async () => {
    const { moonAge } = await modulePromise;
    const near = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b)) < 0.04;   // about a day
    assert.ok(near(moonAge(Date.UTC(2026, 9, 26, 4, 12)), 0.5));    // full moon 2026-10-26
    assert.ok(near(moonAge(Date.UTC(2026, 9, 10, 15, 50)), 0));     // new moon 2026-10-10
});
