import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_FRAME_COUNT,
    buildPreloadOrder,
    computeDrawRect,
    createBrainScrollExperience,
    FrameSequenceStore,
    getFrameUrl,
    progressToFrameIndex
} from '../components/BrainScrollExperience.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

test('progressToFrameIndex maps [0, 1] strictly onto [0, 286]', () => {
    assert.equal(progressToFrameIndex(0, DEFAULT_FRAME_COUNT), 0);
    assert.equal(progressToFrameIndex(1, DEFAULT_FRAME_COUNT), 286);
    assert.equal(progressToFrameIndex(-0.5, DEFAULT_FRAME_COUNT), 0);
    assert.equal(progressToFrameIndex(1.5, DEFAULT_FRAME_COUNT), 286);
    assert.equal(progressToFrameIndex(0.5, DEFAULT_FRAME_COUNT), 143);
});

test('getFrameUrl formats 1-based zero-padded frame paths', () => {
    assert.equal(getFrameUrl('intro/frame-{index}.webp', 0), 'intro/frame-001.webp');
    assert.equal(getFrameUrl('intro/frame-{index}.webp', 85), 'intro/frame-086.webp');
    assert.equal(getFrameUrl('intro/frame-{index}.webp', 286), 'intro/frame-287.webp');
});

test('buildPreloadOrder covers all 287 frames with frame 0 and 286 prioritized', () => {
    const order = buildPreloadOrder(287);
    assert.equal(order.length, 287);
    assert.equal(new Set(order).size, 287);
    assert.equal(order[0], 0);
    assert.equal(order[1], 286);
});

test('computeDrawRect uses full-bleed cover on landscape and preserves brain on portrait mobile', () => {
    const desktop = computeDrawRect(1440, 800, 1280, 720, 0);
    assert.equal(desktop.featherEdges, false);
    assert.ok(desktop.dw >= 1440 && desktop.dh >= 800);

    const mobileEarly = computeDrawRect(390, 700, 720, 405, 0);
    assert.equal(mobileEarly.featherEdges, true);
    assert.ok(mobileEarly.dw < 650, 'Portrait early frame should avoid severe horizontal cropping');

    const mobileInterior = computeDrawRect(390, 700, 720, 405, 0.55);
    assert.ok(mobileInterior.dw > mobileEarly.dw, 'Interior neural frames smoothly expand');
});

test('FrameSequenceStore enforces concurrency limit, LRU eviction, and closes bitmaps on destroy', async () => {
    let active = 0;
    let peakActive = 0;
    let closedCount = 0;

    const priorFetch = globalThis.fetch;
    const priorCreateImageBitmap = globalThis.createImageBitmap;

    globalThis.fetch = async () => {
        active++;
        peakActive = Math.max(peakActive, active);
        await settle();
        active--;
        return {
            ok: true,
            status: 200,
            blob: async () => new Blob(['frame'])
        };
    };
    globalThis.createImageBitmap = async () => ({
        width: 720,
        height: 405,
        close() {
            closedCount++;
        }
    });

    try {
        const store = new FrameSequenceStore({
            frameCount: 24,
            getUrl: i => `frame-${i}.webp`,
            maxDecoded: 10,
            maxConcurrent: 3
        });

        await store.loadPriorityFrame(0);
        assert.ok(store.getBestAvailableFrame(0));

        store.startPreloading();
        for (let step = 0; step < 30; step++) await settle();

        assert.ok(peakActive <= 3, `Expected peak concurrency <= 3, got ${peakActive}`);
        assert.ok(store.getDecodedCount() <= 10, `Expected decoded cache <= 10, got ${store.getDecodedCount()}`);
        assert.ok(closedCount > 0, 'Evicted bitmaps should be closed to release memory');

        // Fallback works for any requested frame
        const nearest = store.getBestAvailableFrame(12);
        assert.ok(nearest && typeof nearest.index === 'number');

        store.destroy();
        assert.equal(store.getDecodedCount(), 0);
    } finally {
        globalThis.fetch = priorFetch;
        globalThis.createImageBitmap = priorCreateImageBitmap;
    }
});

test('createBrainScrollExperience wires ScrollTrigger pin/scrub and handles reduced motion cleanly', async () => {
    const classSet = target => {
        const set = new Set();
        return {
            add: c => set.add(c),
            remove: c => set.delete(c),
            toggle: (c, force) => (force === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : force ? set.add(c) : set.delete(c)),
            contains: c => set.has(c)
        };
    };
    const makeEl = () => ({
        classList: classSet(),
        style: { setProperty() {} },
        getBoundingClientRect: () => ({ width: 1280, height: 720 }),
        querySelector: () => null,
        querySelectorAll: () => []
    });

    const stage = makeEl();
    const canvas = { ...makeEl(), width: 0, height: 0, getContext: () => ({ save() {}, restore() {}, setTransform() {}, fillRect() {}, drawImage() {}, createLinearGradient: () => ({ addColorStop() {} }) }) };
    const poster = makeEl();
    const veil = makeEl();
    const progressBar = makeEl();
    const cue = makeEl();
    const beats = [makeEl(), makeEl(), makeEl()];
    const root = {
        ...makeEl(),
        querySelector: sel => {
            if (sel.includes('stage')) return stage;
            if (sel.includes('canvas')) return canvas;
            if (sel.includes('poster')) return poster;
            if (sel.includes('veil')) return veil;
            if (sel.includes('progress')) return progressBar;
            if (sel.includes('cue')) return cue;
            return null;
        },
        querySelectorAll: sel => (sel.includes('beat') ? beats : [])
    };

    let registered = false;
    let triggerConfig = null;
    let reverted = false;

    const fakeGsap = {
        registerPlugin() { registered = true; },
        set() {},
        timeline(opts) {
            if (opts?.scrollTrigger?.pin) triggerConfig = opts.scrollTrigger;
            const tl = {
                to() { return tl; },
                fromTo() { return tl; },
                kill() {}
            };
            return tl;
        },
        matchMedia() {
            return {
                add(conditions, fn) {
                    fn({ conditions: { reduced: false, mobile: false, desktop: true } });
                },
                revert() {
                    reverted = true;
                }
            };
        }
    };
    const fakeScrollTrigger = { refresh() {} };

    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const priorFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const priorRAF = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');

    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: cb => { cb(); return 1; } });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => ({ ok: true, status: 200, blob: async () => new Blob(['x']) }) });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { connection: null } });
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            devicePixelRatio: 1,
            innerHeight: 900,
            matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
            addEventListener() {},
            removeEventListener() {}
        }
    });

    try {
        const instance = createBrainScrollExperience(root, {
            gsap: fakeGsap,
            ScrollTrigger: fakeScrollTrigger,
            heroSection: null,
            headerElement: null
        });

        assert.equal(registered, true);
        assert.equal(root.classList.contains('is-interactive'), true);
        assert.equal(triggerConfig.pin, stage);
        assert.equal(typeof triggerConfig.scrub, 'number');

        // Simulate forward and reverse scroll progress
        triggerConfig.onUpdate({ progress: 0.5 });
        assert.equal(instance.getFrameIndex(), 143);
        triggerConfig.onUpdate({ progress: 1.0 });
        assert.equal(instance.getFrameIndex(), 286);
        triggerConfig.onUpdate({ progress: 0.0 });
        assert.equal(instance.getFrameIndex(), 0);

        instance.destroy();
        assert.equal(reverted, true);
    } finally {
        for (const [key, desc] of [['window', priorWindow], ['navigator', priorNavigator], ['fetch', priorFetch], ['requestAnimationFrame', priorRAF]]) {
            if (desc) Object.defineProperty(globalThis, key, desc);
            else delete globalThis[key];
        }
    }
});
