const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const {JSDOM} = require('jsdom');

// Test against the real BlueMap 5.3 classes, not imitations of the marker implementation.
const source = path.resolve(process.env.BLUEMAP_SOURCE || '.dev/BlueMap');
const common = fs.existsSync(path.join(source, 'common')) ? 'common' : 'BlueMapCommon';
const markerDir = path.join(source, common, 'webapp/src/js/markers');
assert.ok(fs.existsSync(markerDir), 'Clone BlueMap v5.3 into .dev/BlueMap first (see README).');
const dom = new JSDOM('<!doctype html><body></body>', {url: 'https://map.example/subpath/'});
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.Element = dom.window.Element;
// These tests exercise DOM markers; the unrelated color-picker canvas is unused.
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
const bundle = esbuild.buildSync({
    stdin: {contents: `export {PlayerMarker} from ${JSON.stringify(path.join(markerDir, 'PlayerMarker.js'))};
        export {MarkerSet} from ${JSON.stringify(path.join(markerDir, 'MarkerSet.js'))};
        export {PlayerMarkerManager} from ${JSON.stringify(path.join(markerDir, 'PlayerMarkerManager.js'))};
        export {PerspectiveCamera} from 'three';`, resolveDir: process.cwd()},
    bundle: true, platform: 'node', format: 'cjs', write: false,
    // Match Vite's extension resolution for BlueMap's extensionless Three imports.
    alias: {three: path.resolve('node_modules/three/build/three.module.js'),
        ...Object.fromEntries(fs.readdirSync('node_modules/three/examples/jsm/lines')
        .filter(name => name.endsWith('.js')).map(name =>
            ['three/examples/jsm/lines/' + name.slice(0, -3),
                path.resolve('node_modules/three/examples/jsm/lines', name)]))},
    nodePaths: [path.resolve('node_modules')]
}).outputFiles[0].text;
const library = {exports: {}};
new Function('module', 'exports', 'require', bundle)(library, library.exports, require);
const {PlayerMarker, MarkerSet, PlayerMarkerManager, PerspectiveCamera} = library.exports;
const extension = fs.readFileSync('src/main/resources/web/storms.js', 'utf8');
const style = document.createElement('style');
style.textContent = fs.readFileSync('src/main/resources/web/storms.css', 'utf8');
document.head.append(style);
const id1 = '11111111-1111-1111-1111-111111111111';
const id2 = '22222222-2222-2222-2222-222222222222';
const SET_ID = 'kncraft-wither-storms';
const storm = (uuid, x = 10, name = 'Wither Storm') => ({uuid, name,
    dimension: 'minecraft:overworld', position: {x, y: 80, z: -30}});

async function harness() {
    let frameQueue = [], timers = [], now = 0, failure = false;
    let data = {schema: 1, generatedAt: 1, maps: {overworld: []}};
    let requested;
    const root = new MarkerSet('root');
    const app = {mapViewer: {markers: root, map: {data: {id: 'overworld'}}}};
    window.requestAnimationFrame = callback => frameQueue.push(callback);
    const context = vm.createContext({
        window: {bluemap: app, BlueMap: {PlayerMarker, MarkerSet}},
        document: {baseURI: 'https://map.example/subpath/',
            currentScript: {src: 'https://map.example/subpath/witherstorm-bluemap/storms.js?v=1.0.0'}},
        URL, Date, AbortSignal, console: {warn() {}},
        performance: {now: () => now},
        fetch: async (url, options) => {
            requested = {url: String(url), options};
            if (failure) throw new Error('offline');
            return {ok: true, json: async () => structuredClone(data)};
        },
        setTimeout: (callback, interval) => { assert.equal(interval, 1000); timers.push(callback); }
    });
    vm.runInContext(extension, context);
    await new Promise(setImmediate);
    return {
        app, root, context,
        get set() { return root.markerSets.get(SET_ID); },
        get requested() { return requested; },
        setData: value => { data = value; },
        fail: () => { failure = true; },
        recover: () => { failure = false; },
        advance: ms => { now += ms; },
        async poll() { assert.equal(timers.length, 1); const callback = timers.shift(); await callback(); },
        frame(time) { const queue = frameQueue; frameQueue = []; for (const fn of queue) fn(time); }
    };
}

test('native marker instances animate two storms and safely display names', async () => {
    const h = await harness();
    const name = '<img src=x onerror=alert(1)>';
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1, 10, name), storm(id2, -100)]}});
    await h.poll();
    assert.equal(h.set.markers.size, 2);
    const first = h.set.markers.get('storm-' + id1);
    assert.ok(first instanceof PlayerMarker);
    assert.equal(first.position.x, 10);
    assert.equal(first.position.y, 80);
    assert.equal(first.playerNameElement.textContent, name);
    assert.equal(first.playerNameElement.querySelector('img'), null);
    assert.equal(first.playerHeadElement.src, 'https://map.example/subpath/witherstorm-bluemap/storm.png?v=1.0.0');
    assert.equal(first.data.type, 'witherstorm');
    assert.equal(h.requested.options.cache, 'no-store');
    h.setData({schema: 1, generatedAt: 3, maps: {overworld: [storm(id1, 110), storm(id2, -100)]}});
    await h.poll();
    h.frame(0); h.frame(500);
    assert.equal(first.position.x, 60); // Actual native one-second cubic interpolation.
    h.frame(1000);
    assert.equal(first.position.x, 110);
    assert.equal(h.set.markers.get('storm-' + id1), first);
});

test('normal marker refresh preserves live instances, visibility, and other layers', async () => {
    const h = await harness();
    const homes = new MarkerSet('homes'); h.root.add(homes);
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1)]}});
    await h.poll();
    const first = h.set.markers.get('storm-' + id1);
    h.set.visible = false;
    h.root.updateMarkerSetsFromData({[SET_ID]: {label: 'Wither Storms', toggleable: true, markers: {}}, homes: {}});
    assert.equal(h.set.markers.get('storm-' + id1), first);
    assert.equal(h.set.visible, false);
    assert.equal(h.root.markerSets.get('homes'), homes);
});

test('last player leaving does not remove storms or stop their live movement', async () => {
    const h = await harness();
    const players = new PlayerMarkerManager(h.root, 'live/players.json', 'assets/playerheads/');
    players.updateFromData({players: [{uuid: id1, name: 'Online player', foreign: false,
        position: {x: 10, y: 80, z: -30}}]});
    assert.equal(players.getPlayerMarkerSet().markers.size, 1);
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1), storm(id2)]}});
    await h.poll();
    const first = h.set.markers.get('storm-' + id1);
    const second = h.set.markers.get('storm-' + id2);

    players.updateFromData({players: []});
    assert.equal(players.getPlayerMarkerSet().markers.size, 0);
    assert.equal(h.set.markers.size, 2);
    // Stay empty well beyond the feed-expiry period, with fresh server samples.
    for (let sample = 1; sample <= 30; sample++) {
        h.advance(1000);
        players.updateFromData({players: []});
        h.setData({schema: 1, generatedAt: 2 + sample, maps: {
            overworld: [storm(id1, 10 + sample * 10), storm(id2, 10 - sample * 10)]
        }});
        await h.poll();
        h.frame(0); h.frame(1000);
        assert.equal(h.set.markers.get('storm-' + id1), first);
        assert.equal(h.set.markers.get('storm-' + id2), second);
        assert.equal(first.position.x, 10 + sample * 10);
        assert.equal(second.position.x, 10 - sample * 10);
        assert.equal(h.set.visible, true);
    }
    players.clear();
    assert.equal(h.set.markers.size, 2);
});

test('opening the map with nobody online still creates and updates storm markers', async () => {
    const h = await harness();
    const players = new PlayerMarkerManager(h.root, 'live/players.json', 'assets/playerheads/');
    players.updateFromData({players: []});
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1), storm(id2)]}});
    await h.poll();
    assert.equal(players.getPlayerMarkerSet().markers.size, 0);
    assert.equal(h.set.markers.size, 2);
    assert.equal(h.set.visible, true);
    assert.equal(h.set.markers.get('storm-' + id1).position.x, 10);
});

test('removal and map changes clear old storm locations', async () => {
    const h = await harness();
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1), storm(id2)], nether: []}});
    await h.poll();
    h.setData({schema: 1, generatedAt: 3, maps: {overworld: [storm(id2)], nether: [storm(id1, 900)]}});
    await h.poll();
    assert.equal(h.set.markers.size, 1);
    assert.equal(h.set.markers.has('storm-' + id1), false);
    h.app.mapViewer.map = {data: {id: 'nether'}};
    await h.poll();
    assert.equal(h.set.markers.has('storm-' + id2), false);
    assert.equal(h.set.markers.get('storm-' + id1).position.x, 900);
});

test('failed and frozen feeds expire markers and recover', async () => {
    const h = await harness();
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1)]}});
    await h.poll();
    h.fail(); await h.poll(); assert.equal(h.set.markers.size, 0);
    h.recover(); await h.poll(); assert.equal(h.set.markers.size, 1);
    h.advance(16000); await h.poll(); assert.equal(h.set.markers.size, 0);
    h.setData({schema: 1, generatedAt: 3, maps: {overworld: [storm(id1)]}});
    await h.poll(); assert.equal(h.set.markers.size, 1);
});

test('phase evolution changes head artwork and labels without replacing animated markers', async () => {
    const h = await harness();
    let marker;
    for (let phase = 0; phase <= 7; phase++) {
        h.setData({schema: 1, generatedAt: phase + 2, maps: {overworld: [
            {...storm(id1, 10 + phase * 100), phase, otherHeadsDisabled: phase === 6},
            {...storm(id2), phase: 1, otherHeadsDisabled: false}
        ]}});
        await h.poll();
        const current = h.set.markers.get('storm-' + id1);
        if (marker) assert.equal(current, marker);
        marker = current;
        assert.ok(marker.playerHeadElement.src.endsWith((phase <= 1 ? 'wither.png' : 'storm.png') + '?v=1.0.0'));
        assert.equal(marker.stormPhase.textContent, String(phase));
        assert.equal(marker.playerHeadElement.alt, `Wither Storm — Phase ${phase}`);
        assert.match(marker.element.title, new RegExp(`Phase ${phase}`));
        for (const side of marker.stormSideHeads) {
            assert.equal(side.hidden, phase === 6);
            assert.ok(side.src.endsWith((phase <= 3 ? 'wither.png' : 'storm.png') + '?v=1.0.0'));
        }
        assert.equal(h.set.markers.get('storm-' + id2).stormPhase.textContent, '1');
        h.frame(0); h.frame(500);
        if (phase > 0) assert.equal(marker.position.x, 10 + (phase - 0.5) * 100);
        h.frame(1000);
    }
});

test('regrowing side heads updates within phase six and invalid phases use the default head', async () => {
    const h = await harness();
    for (const disabled of [true, false]) {
        h.setData({schema: 1, generatedAt: disabled ? 2 : 3, maps: {overworld: [
            {...storm(id1), phase: 6, otherHeadsDisabled: disabled}
        ]}});
        await h.poll();
        const marker = h.set.markers.get('storm-' + id1);
        assert.equal(marker.stormIcon.classList.contains('single-head'), disabled);
        assert.equal(marker.stormSideHeads[0].hidden, disabled);
    }
    for (const phase of [undefined, null, -1, 8, 2.5, '3', '<img src=x onerror=alert(1)>']) {
        h.setData({schema: 1, generatedAt: 4, maps: {overworld: [{...storm(id1), phase}]}});
        await h.poll();
        const marker = h.set.markers.get('storm-' + id1);
        assert.equal(marker.stormPhase.textContent, '');
        assert.equal(marker.stormIcon.classList.contains('single-head'), true);
        assert.ok(marker.playerHeadElement.src.endsWith('storm.png?v=1.0.0'));
        assert.equal(marker.data.label, 'Wither Storm');
    }
});

test('storm icon scales at the native player distance thresholds without changing real players', async () => {
    const h = await harness();
    h.setData({schema: 1, generatedAt: 2, maps: {overworld: [storm(id1)]}});
    await h.poll();
    const marker = h.set.markers.get('storm-' + id1);
    document.body.append(marker.elementObject.element);
    const player = new PlayerMarker('real-player', id2);
    document.body.append(player.elementObject.element);
    const camera = new PerspectiveCamera();
    for (const [distance, expected, size] of [[100, 'near', '40px'], [2000, 'med', '20px'], [6000, 'far', '20px']]) {
        camera.position.set(marker.position.x, marker.position.y, marker.position.z + distance);
        camera.updateMatrixWorld();
        marker.onBeforeRender(null, null, camera);
        assert.equal(marker.element.getAttribute('distance-data'), expected);
        assert.equal(window.getComputedStyle(marker.stormIcon).width, size);
        assert.equal(window.getComputedStyle(marker.stormIcon).height, size);
    }
    assert.equal(marker.playerHeadElement.style.width, '');
    assert.equal(player.element.querySelector('.witherstorm-icon'), null);
    assert.equal(player.playerHeadElement.style.width, '');
    marker.elementObject.element.remove();
    player.elementObject.element.remove();
});
