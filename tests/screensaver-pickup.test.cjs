const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

process.env.TZ = 'America/Los_Angeles';
const context = vm.createContext({ Ticker: class {}, Timers: class {}, Date, URLSearchParams, location: { search: '' } });
const source = fs.readFileSync(path.join(__dirname, '../js/screensaver.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function startScreensaver', 'function startScreensaver');
vm.runInContext(source + '\nglobalThis.Insights = Insights;', context);
const now = new Date('2026-10-08T16:00:00-07:00');

function insights() {
    const instance = new context.Insights('', '', null);
    instance.data = {
        viewerHome: true, statesAt: now.getTime(),
        attendance: { status: 'checked_in', at: '2026-10-08T07:29:00-07:00', sync: now.toISOString(), syncOk: true, parentAtSchool: false },
        commutes: [{ entity: 'sensor.waze_kings_commute', value: '4', at: now.toISOString(), active: true }]
    };
    return instance;
}

test('pickup rotates with short, fresh drive time', () => {
    const line = insights().pickupLine(now);
    assert.equal(line[0], '');
    assert.equal(line[2], "Liam: at King's - <b>4 minutes</b> away");
});

test('pickup respects both time boundaries', () => {
    for (const [time, visible] of [['14:29:59', false], ['14:30:00', true], ['17:59:59', true], ['18:00:00', false]]) {
        const at = new Date(`2026-10-08T${time}-07:00`);
        const instance = insights();
        instance.data.statesAt = at.getTime();
        instance.data.attendance.sync = at.toISOString();
        assert.equal(!!instance.pickupLine(at), visible, time);
    }
});

test('checkout, unknown attendance, nobody home and parent at school suppress pickup', () => {
    for (const status of ['checked_out', 'unknown', 'unavailable']) {
        const instance = insights();
        instance.data.attendance.status = status;
        assert.equal(instance.pickupLine(now), null);
    }
    const emptyHome = insights();
    emptyHome.data.viewerHome = false;
    assert.equal(emptyHome.pickupLine(now), null);
    const atSchool = insights();
    atSchool.data.attendance.parentAtSchool = true;
    assert.equal(atSchool.pickupLine(now), null);
});

test('stale, invalid and future attendance or sync never triggers pickup', () => {
    for (const at of ['2026-10-07T07:29:00-07:00', 'invalid', null, '2026-10-08T17:00:00-07:00']) {
        const instance = insights();
        instance.data.attendance.at = at;
        assert.equal(instance.pickupLine(now), null);
    }
    for (const sync of ['2026-10-08T15:44:59-07:00', 'invalid', null, '2026-10-08T17:00:00-07:00']) {
        const instance = insights();
        instance.data.attendance.sync = sync;
        assert.equal(instance.pickupLine(now), null);
    }
    const failedSync = insights();
    failedSync.data.attendance.syncOk = false;
    assert.equal(failedSync.pickupLine(now), null);
});

test('failed HA refresh expires the presence and attendance snapshot', () => {
    const instance = insights();
    instance.data.statesAt -= 120000;
    assert.equal(instance.pickupLine(now), null);
});

test('stale or unavailable route hides minutes, not known attendance', () => {
    for (const value of ['unknown', 'unavailable', '', '0']) {
        const instance = insights();
        instance.data.commutes[0].value = value;
        assert.equal(instance.pickupLine(now)[2], "Liam: at King's");
    }
    const instance = insights();
    instance.data.commutes[0].at = '2026-10-08T07:30:00-07:00';
    assert.equal(instance.pickupLine(now)[2], "Liam: at King's");
});

test('heavy traffic uses the fresh King\'s route', () => {
    const instance = insights();
    instance.data.commutes[0].value = '10';
    assert.match(instance.pickupLine(now)[2], /10 minutes.*HEAVY TRAFFIC/);
});

test('preview is synthetic and does not mutate live data', () => {
    const instance = insights();
    instance.commutePreview = 'pickup';
    instance.data.viewerHome = false;
    instance.data.attendance.status = 'checked_out';
    assert.equal(instance.pickupLine(now)[0], 'homeward featured');
    assert.match(instance.pickupLine(now)[2], /4 minutes/);
    assert.equal(instance.data.attendance.status, 'checked_out');
    assert.equal(instance.data.viewerHome, false);
});

function morning(at = new Date('2026-10-08T07:00:00-07:00')) {
    const instance = insights();
    instance.data.statesAt = at.getTime();
    instance.data.attendance = { status: 'checked_out', at: '2026-10-07T17:00:00-07:00', sync: at.toISOString(), syncOk: true };
    instance.data.commutes[0].at = at.toISOString();
    return instance;
}

test('morning drop-off replaces the unconditional King\'s commute', () => {
    const at = new Date('2026-10-08T07:00:00-07:00');
    const instance = morning(at);
    assert.equal(instance.dropoffLine(at)[2], "King's: drop-off - <b>4 minutes</b> away");
    assert.equal(instance.lines(at).filter(line => line[2].includes("King's")).length, 1);
});

test('check-in, any same-day attendance, stale feed, or parent at school hides drop-off', () => {
    const at = new Date('2026-10-08T07:30:00-07:00');
    for (const change of [
        { status: 'checked_in' }, { status: 'unknown' }, { status: 'unavailable' },
        { at: '2026-10-08T07:29:00-07:00' }, { at: '2026-10-01T17:00:00-07:00' },
        { at: 'invalid' }, { parentAtSchool: true }, { syncOk: false },
        { sync: '2026-10-08T06:00:00-07:00' }
    ]) {
        const instance = morning(at);
        Object.assign(instance.data.attendance, change);
        assert.equal(instance.dropoffLine(at), null, JSON.stringify(change));
    }
    const instance = morning(at);
    instance.data.viewerHome = false;
    assert.equal(instance.dropoffLine(at), null);
});

test('drop-off is weekday mornings only and accepts Friday checkout on Monday', () => {
    for (const [stamp, visible] of [
        ['2026-10-08T06:29:59-07:00', false], ['2026-10-08T06:30:00-07:00', true],
        ['2026-10-08T07:59:59-07:00', true], ['2026-10-08T08:00:00-07:00', false],
        ['2026-10-10T07:00:00-07:00', false], ['2026-10-11T07:00:00-07:00', false],
        ['2026-10-12T07:00:00-07:00', true]
    ]) {
        const at = new Date(stamp), instance = morning(at);
        instance.data.attendance.at = stamp.startsWith('2026-10-12') ? '2026-10-09T17:00:00-07:00' : '2026-10-07T17:00:00-07:00';
        assert.equal(!!instance.dropoffLine(at), visible, stamp);
    }
});
