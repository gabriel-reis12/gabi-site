import test from 'node:test';
import assert from 'node:assert/strict';
import { mountJourneyScene } from '../components/journey-scene.js';

function setup({ reduced = false, mobile = false, saveData = false, observer = true } = {}) {
    const media = [Object.assign(new EventTarget(), { matches: reduced }), Object.assign(new EventTarget(), { matches: mobile })];
    const connection = Object.assign(new EventTarget(), { saveData });
    let intersection;
    const mount = { hidden: true, children: [], append(node) { this.children.push(node); }, replaceChildren() { this.children = []; } };
    const fallback = { hidden: false };
    const root = { querySelector: selector => selector.includes('mount') ? mount : fallback, getBoundingClientRect: () => ({ width: 480, height: 600 }) };
    class Observer { constructor(callback) { intersection = callback; } observe() {} disconnect() { intersection = undefined; } }
    const prior = Object.fromEntries(['window','document','navigator','IntersectionObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: query => media[query.includes('reduce') ? 0 : 1], ...(observer ? { IntersectionObserver: Observer } : {}) } });
    Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: Observer });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { connection } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ remove() { mount.children = mount.children.filter(node => node !== this); } }) } });
    return { root, mount, fallback, media, connection, enter: () => intersection?.([{ isIntersecting: true }]), leave: () => intersection?.([{ isIntersecting: false }]), restore() {
        for (const [key, descriptor] of Object.entries(prior)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('static default needs neither browser APIs nor a loader', () => {
    assert.equal(typeof mountJourneyScene(null), 'function');
    assert.equal(typeof mountJourneyScene({}), 'function');
});
test('loads near viewport, replaces fallback only after readiness, disposes on preference change', async () => {
    const env = setup(); let loads = 0; let destroyed = 0; let resolve;
    const dispose = mountJourneyScene(env.root, { loadExperience: () => { loads++; return new Promise(done => { resolve = done; }); } });
    try {
        assert.equal(loads, 0);
        env.enter(); assert.equal(loads, 1); assert.equal(env.fallback.hidden, false);
        resolve({ destroy() { destroyed++; } }); await settle();
        assert.equal(env.mount.hidden, false); assert.equal(env.fallback.hidden, true);
        env.media[0].matches = true; env.media[0].dispatchEvent(new Event('change')); await settle();
        assert.equal(destroyed, 1); assert.equal(env.fallback.hidden, false); assert.equal(env.mount.hidden, true);
    } finally { dispose(); env.restore(); }
});
for (const options of [{ reduced: true }, { mobile: true }, { saveData: true }, { observer: false }]) {
    test(`no cinematic load under ${JSON.stringify(options)}`, async () => {
        const env = setup(options); let loads = 0;
        const dispose = mountJourneyScene(env.root, { loadExperience: async () => { loads++; } });
        try { env.enter(); await settle(); assert.equal(loads,0); assert.equal(env.fallback.hidden,false); }
        finally { dispose(); env.restore(); }
    });
}
test('failed loader keeps fallback and removes staging nodes', async () => {
    const env = setup();
    const dispose = mountJourneyScene(env.root, { loadExperience: async () => { throw new Error('Asset unavailable'); } });
    try { env.enter(); await settle(); assert.equal(env.fallback.hidden,false); assert.equal(env.mount.hidden,true); assert.equal(env.mount.children.length,0); }
    finally { dispose(); env.restore(); }
});
test('late async result is disposed after unmount and cannot replace fallback', async () => {
    const env = setup(); let resolve; let signal; let destroyed = 0;
    const dispose = mountJourneyScene(env.root, { loadExperience: args => { signal = args.signal; return new Promise(done => { resolve = done; }); } });
    try {
        env.enter(); dispose(); assert.equal(signal.aborted, true);
        resolve({ destroy() { destroyed++; } }); await settle();
        assert.equal(destroyed,1); assert.equal(env.fallback.hidden,false); assert.equal(env.mount.children.length,0);
    } finally { env.restore(); }
});
test('stale completion cannot replace a newer active renderer', async () => {
    const env = setup(); const requests = []; let staleDestroyed = 0;
    const dispose = mountJourneyScene(env.root, { loadExperience: () => new Promise(resolve => requests.push(resolve)) });
    try {
        env.enter(); env.leave(); env.enter();
        assert.equal(requests.length,2);
        requests[1]({ destroy() {} }); await settle();
        requests[0]({ destroy() { staleDestroyed++; } }); await settle();
        assert.equal(staleDestroyed,1); assert.equal(env.mount.hidden,false); assert.equal(env.fallback.hidden,true); assert.equal(env.mount.children.length,1);
    } finally { dispose(); env.restore(); }
});
test('a broken renderer cleanup still restores the static hero', async () => {
    const env = setup();
    const dispose = mountJourneyScene(env.root, { loadExperience: async () => ({ destroy() { throw new Error('Renderer failure'); } }) });
    try {
        env.enter(); await settle(); dispose();
        assert.equal(env.mount.hidden,true); assert.equal(env.fallback.hidden,false);
    } finally { env.restore(); }
});
