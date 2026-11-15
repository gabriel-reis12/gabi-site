/**
 * BrainScrollExperience — The Inner Journey
 * Isolated GSAP ScrollTrigger + HTML Canvas 2D sequence renderer.
 */

export const DEFAULT_FRAME_COUNT = 287;
export const DEFAULT_DESKTOP_PATH = 'Imagens/optimized/intro-desktop/frame-{index}.webp';
export const DEFAULT_MOBILE_PATH = 'Imagens/optimized/intro-mobile/frame-{index}.webp';

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function padFrameNumber(index) {
    return String(index + 1).padStart(3, '0');
}

export function getFrameUrl(template, index) {
    return template.replace('{index}', padFrameNumber(index));
}

export function progressToFrameIndex(progress, frameCount = DEFAULT_FRAME_COUNT) {
    const safeCount = Math.max(1, frameCount);
    return Math.round(clamp(progress, 0, 1) * (safeCount - 1));
}

function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
}

/**
 * Computes destination rectangle on Canvas 2D.
 * Landscape uses full-bleed cover; portrait mobile uses a generous focal framing
 * (~1.56x contain) that keeps 100% of the brain visible on frame 001 while filling
 * the upper-middle stage cleanly above the editorial text.
 */
export function computeDrawRect(canvasWidth, canvasHeight, imageWidth, imageHeight, progress = 0) {
    if (!canvasWidth || !canvasHeight || !imageWidth || !imageHeight) {
        return { dx: 0, dy: 0, dw: 0, dh: 0, featherEdges: false };
    }
    const canvasAspect = canvasWidth / canvasHeight;
    if (canvasAspect >= 1.05) {
        const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
        const dw = imageWidth * scale;
        const dh = imageHeight * scale;
        return {
            dx: (canvasWidth - dw) / 2,
            dy: (canvasHeight - dh) / 2,
            dw,
            dh,
            featherEdges: false
        };
    }

    const containScale = canvasWidth / imageWidth;
    const coverScale = canvasHeight / imageHeight;
    const initialScale = containScale * 1.56;
    const interiorScale = Math.max(initialScale, Math.min(coverScale * 0.94, containScale * 2.25));
    const zoomBlend = smoothstep((progress - 0.14) / 0.4);
    const scale = initialScale + (interiorScale - initialScale) * zoomBlend;
    const dw = imageWidth * scale;
    const dh = imageHeight * scale;
    return {
        dx: (canvasWidth - dw) / 2,
        dy: (canvasHeight - dh) * 0.34,
        dw,
        dh,
        featherEdges: dh < canvasHeight - 2
    };
}

/**
 * Builds an ordered list of frame indices for stratified preloading:
 * frame 0 and last frame first, then dyadic strata (16, 8, 4, 2, 1) so all even frames
 * are ready in half the time before filling odd frames.
 */
export function buildPreloadOrder(frameCount) {
    const order = [];
    const seen = new Set();
    const push = index => {
        if (index >= 0 && index < frameCount && !seen.has(index)) {
            seen.add(index);
            order.push(index);
        }
    };
    push(0);
    push(frameCount - 1);
    for (const step of [16, 8, 4, 2, 1]) {
        for (let i = 0; i < frameCount; i += step) push(i);
    }
    return order;
}

/**
 * Bounded frame downloader, Blob cache, and LRU decoded ImageBitmap cache.
 */
export class FrameSequenceStore {
    constructor({
        frameCount = DEFAULT_FRAME_COUNT,
        getUrl,
        maxDecoded = 64,
        maxConcurrent = 6,
        onFrameReady
    }) {
        this.frameCount = frameCount;
        this.getUrl = getUrl;
        this.maxDecoded = Math.max(8, maxDecoded);
        this.maxConcurrent = Math.max(1, maxConcurrent);
        this.onFrameReady = onFrameReady;

        this.blobs = new Array(frameCount).fill(null);
        this.decoded = new Map();
        this.inFlight = new Map();
        this.decoding = new Map();
        this.failed = new Set();
        this.preloadQueue = buildPreloadOrder(frameCount);
        this.targetFrame = 0;
        this.scrollDirection = 1;
        this.activeFetches = 0;
        this.controller = new AbortController();
        this.disposed = false;
        this.useCounter = 0;
    }

    setTargetFrame(index) {
        if (this.disposed) return;
        const clamped = clamp(index, 0, this.frameCount - 1);
        if (clamped !== this.targetFrame) {
            this.scrollDirection = clamped >= this.targetFrame ? 1 : -1;
            this.targetFrame = clamped;
        }
        // Pre-decode target and immediate neighbors from already-cached Blobs.
        for (const offset of [0, this.scrollDirection, 2 * this.scrollDirection, -this.scrollDirection]) {
            const candidate = clamped + offset;
            if (candidate >= 0 && candidate < this.frameCount && this.blobs[candidate]) {
                void this.#ensureDecoded(candidate);
            }
        }
        this.#pumpQueue();
    }

    async loadPriorityFrame(index = 0) {
        if (this.disposed) return null;
        await this.#fetchAndDecode(index, true);
        return this.decoded.get(index) || null;
    }

    startPreloading() {
        if (this.disposed) return;
        this.#pumpQueue();
    }

    getBestAvailableFrame(target) {
        const exact = this.decoded.get(target);
        if (exact) {
            exact.lastUsed = ++this.useCounter;
            return { index: target, entry: exact };
        }
        for (let offset = 1; offset < this.frameCount; offset++) {
            const forward = target + offset;
            if (forward < this.frameCount && this.decoded.has(forward)) {
                const entry = this.decoded.get(forward);
                entry.lastUsed = ++this.useCounter;
                return { index: forward, entry };
            }
            const backward = target - offset;
            if (backward >= 0 && this.decoded.has(backward)) {
                const entry = this.decoded.get(backward);
                entry.lastUsed = ++this.useCounter;
                return { index: backward, entry };
            }
        }
        return null;
    }

    getDecodedCount() {
        return this.decoded.size;
    }

    destroy() {
        this.disposed = true;
        this.controller.abort();
        for (const entry of this.decoded.values()) {
            entry.bitmap?.close?.();
        }
        this.decoded.clear();
        this.blobs.fill(null);
        this.inFlight.clear();
        this.decoding.clear();
        this.preloadQueue = [];
    }

    #pickNextQueueIndex() {
        const windowOffsets = [];
        for (let d = 0; d <= 16; d++) {
            windowOffsets.push(this.targetFrame + d * this.scrollDirection);
            if (d > 0 && d <= 8) windowOffsets.push(this.targetFrame - d * this.scrollDirection);
        }
        for (const candidate of windowOffsets) {
            if (
                candidate >= 0 &&
                candidate < this.frameCount &&
                !this.blobs[candidate] &&
                !this.inFlight.has(candidate) &&
                !this.failed.has(candidate)
            ) {
                return candidate;
            }
        }
        while (this.preloadQueue.length > 0) {
            const next = this.preloadQueue.shift();
            if (!this.blobs[next] && !this.inFlight.has(next) && !this.failed.has(next)) {
                return next;
            }
        }
        return -1;
    }

    #pumpQueue() {
        if (this.disposed) return;
        while (this.activeFetches < this.maxConcurrent) {
            const next = this.#pickNextQueueIndex();
            if (next === -1) break;
            void this.#fetchAndDecode(next, Math.abs(next - this.targetFrame) <= 20);
        }
    }

    async #fetchAndDecode(index, decodeNow) {
        if (this.disposed) return;
        if (this.blobs[index]) {
            if (decodeNow) await this.#ensureDecoded(index);
            return;
        }
        if (this.inFlight.has(index)) {
            await this.inFlight.get(index);
            if (decodeNow) await this.#ensureDecoded(index);
            return;
        }
        const task = (async () => {
            this.activeFetches++;
            try {
                const blob = await this.#fetchBlobWithRetry(this.getUrl(index));
                if (this.disposed) return;
                this.blobs[index] = blob;
                if (decodeNow || this.decoded.size < this.maxDecoded) {
                    await this.#ensureDecoded(index);
                }
            } catch {
                this.failed.add(index);
            } finally {
                this.activeFetches--;
                this.inFlight.delete(index);
                if (!this.disposed) this.#pumpQueue();
            }
        })();
        this.inFlight.set(index, task);
        await task;
    }

    async #fetchBlobWithRetry(url) {
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await fetch(url, { signal: this.controller.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.blob();
            } catch (error) {
                if (this.controller.signal.aborted) throw error;
                lastError = error;
            }
        }
        throw lastError;
    }

    async #ensureDecoded(index) {
        if (this.disposed || this.decoded.has(index)) return;
        const blob = this.blobs[index];
        if (!blob) return;
        if (this.decoding.has(index)) {
            await this.decoding.get(index);
            return;
        }
        const task = (async () => {
            try {
                const resource = await this.#decodeBlob(blob);
                if (this.disposed) {
                    resource.bitmap?.close?.();
                    return;
                }
                this.#evictIfNeeded();
                this.decoded.set(index, { ...resource, lastUsed: ++this.useCounter });
                if (Math.abs(index - this.targetFrame) <= 3 || index === 0) {
                    this.onFrameReady?.(index);
                }
            } catch {
                // Ignore transient decode failure; nearest cached frame covers it.
            } finally {
                this.decoding.delete(index);
            }
        })();
        this.decoding.set(index, task);
        await task;
    }

    async #decodeBlob(blob) {
        if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(blob);
            return { drawable: bitmap, bitmap, width: bitmap.width, height: bitmap.height };
        }
        const url = URL.createObjectURL(blob);
        try {
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
            await img.decode();
            return { drawable: img, bitmap: null, width: img.naturalWidth, height: img.naturalHeight };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    #evictIfNeeded() {
        while (this.decoded.size >= this.maxDecoded) {
            let victim = -1;
            let bestScore = -1;
            for (const [idx, entry] of this.decoded.entries()) {
                if (idx === 0 || idx === this.frameCount - 1 || idx === this.targetFrame) continue;
                const distance = Math.abs(idx - this.targetFrame);
                const agePenalty = (this.useCounter - entry.lastUsed) * 0.05;
                const score = distance + agePenalty;
                if (score > bestScore) {
                    bestScore = score;
                    victim = idx;
                }
            }
            if (victim === -1) break;
            const removed = this.decoded.get(victim);
            removed?.bitmap?.close?.();
            this.decoded.delete(victim);
        }
    }
}

/**
 * Mounts the pinned GSAP ScrollTrigger brain journey experience on `root`.
 */
export function createBrainScrollExperience(root, options = {}) {
    if (!root) return { destroy() {} };

    const {
        frameCount = DEFAULT_FRAME_COUNT,
        desktopPath = DEFAULT_DESKTOP_PATH,
        mobilePath = DEFAULT_MOBILE_PATH,
        mobileBreakpoint = '(max-width: 760px)',
        reducedMotionQuery = '(prefers-reduced-motion: reduce)',
        heroSection = document.querySelector('#inicio'),
        headerElement = document.querySelector('.site-header'),
        gsap = window.gsap,
        ScrollTrigger = window.ScrollTrigger
    } = options;

    const stage = root.querySelector('[data-brain-stage]');
    const canvas = root.querySelector('[data-brain-canvas]');
    const poster = root.querySelector('.brain-journey-poster');
    const veil = root.querySelector('[data-brain-veil]');
    const progressBar = root.querySelector('[data-brain-progress]');
    const cue = root.querySelector('[data-brain-cue]');
    const beats = [...root.querySelectorAll('[data-beat]')];

    if (!stage || !canvas) return { destroy() {} };

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx || !gsap || !ScrollTrigger) {
        return { destroy() {} };
    }

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config?.({ ignoreMobileResize: true });

    const mobileMq = window.matchMedia(mobileBreakpoint);
    const connection = navigator.connection;

    let disposed = false;
    let store = null;
    let matchMediaCtx = null;
    let resizeObserver = null;
    let currentProgress = 0;
    let currentTargetFrame = 0;
    let lastWindowWidth = window.innerWidth || 0;
    let canvasSize = { width: 0, height: 0, dpr: 1 };
    let lastDrawState = { frame: -1, actualFrame: -1, width: 0, height: 0, progressKey: -1 };
    let rafPending = false;

    const getHeaderOffset = () => {
        if (!headerElement) return 0;
        const rect = headerElement.getBoundingClientRect();
        return Math.round(rect.height || 0);
    };

    const syncStageHeight = () => {
        const headerHeight = getHeaderOffset();
        root.style.setProperty('--header-offset', `${headerHeight}px`);
    };

    const resizeCanvas = () => {
        const rect = stage.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        const maxDpr = mobileMq.matches ? 1.5 : 2;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        canvasSize = { width, height, dpr };
    };

    const paintDrawable = (drawable, imgWidth, imgHeight) => {
        const { width, height, dpr } = canvasSize;
        if (!width || !height || !imgWidth || !imgHeight) return;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#100c0a';
        ctx.fillRect(0, 0, width, height);

        const rect = computeDrawRect(width, height, imgWidth, imgHeight, currentProgress);
        ctx.drawImage(drawable, rect.dx, rect.dy, rect.dw, rect.dh);

        if (rect.featherEdges) {
            const topEdge = rect.dy;
            const bottomEdge = rect.dy + rect.dh;
            const featherHeight = Math.max(32, rect.dh * 0.26);

            const topGrad = ctx.createLinearGradient(0, topEdge, 0, topEdge + featherHeight);
            topGrad.addColorStop(0, 'rgba(16, 12, 10, 1)');
            topGrad.addColorStop(0.55, 'rgba(16, 12, 10, 0.35)');
            topGrad.addColorStop(1, 'rgba(16, 12, 10, 0)');
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, Math.max(0, topEdge - 2), width, featherHeight + 2);

            const botGrad = ctx.createLinearGradient(0, bottomEdge - featherHeight, 0, bottomEdge);
            botGrad.addColorStop(0, 'rgba(16, 12, 10, 0)');
            botGrad.addColorStop(0.45, 'rgba(16, 12, 10, 0.35)');
            botGrad.addColorStop(1, 'rgba(16, 12, 10, 1)');
            ctx.fillStyle = botGrad;
            ctx.fillRect(0, bottomEdge - featherHeight, width, featherHeight + 4);
        }
        ctx.restore();
    };

    const drawFrame = (force = false) => {
        if (disposed) return;
        const { width, height } = canvasSize;
        if (!width || !height) return;

        const targetIndex = progressToFrameIndex(currentProgress, frameCount);
        const best = store?.getBestAvailableFrame(targetIndex);
        if (!best) {
            if (poster?.complete && poster.naturalWidth > 0) {
                paintDrawable(poster, poster.naturalWidth, poster.naturalHeight);
                canvas.classList.add('is-ready');
                poster.classList.add('is-hidden');
            }
            return;
        }

        const progressKey = width / height < 1.05 ? Math.round(currentProgress * 100) : 0;
        if (
            !force &&
            lastDrawState.frame === targetIndex &&
            lastDrawState.actualFrame === best.index &&
            lastDrawState.width === width &&
            lastDrawState.height === height &&
            lastDrawState.progressKey === progressKey
        ) {
            return;
        }

        lastDrawState = { frame: targetIndex, actualFrame: best.index, width, height, progressKey };
        paintDrawable(best.entry.drawable, best.entry.width, best.entry.height);
    };

    const scheduleDraw = (force = false) => {
        if (disposed) return;
        if (force) {
            drawFrame(true);
            return;
        }
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            drawFrame(false);
        });
    };

    const initStore = isMobile => {
        store?.destroy();
        const template = isMobile || connection?.saveData ? mobilePath : desktopPath;
        const maxDecoded = isMobile ? 42 : 76;
        const maxConcurrent = connection?.saveData ? 3 : (isMobile ? 6 : 8);
        store = new FrameSequenceStore({
            frameCount,
            getUrl: idx => getFrameUrl(template, idx),
            maxDecoded,
            maxConcurrent,
            onFrameReady: idx => {
                if (idx === 0) {
                    canvas.classList.add('is-ready');
                    poster?.classList.add('is-hidden');
                }
                scheduleDraw(false);
            }
        });
        if (poster?.complete && poster.naturalWidth > 0) {
            scheduleDraw(true);
        } else {
            poster?.addEventListener?.('load', () => scheduleDraw(true), { once: true });
        }
        void store.loadPriorityFrame(0).then(entry => {
            if (!disposed && entry) {
                resizeCanvas();
                scheduleDraw(true);
                store.startPreloading();
            }
        });
    };

    const setupMatchMedia = () => {
        matchMediaCtx?.revert();
        matchMediaCtx = gsap.matchMedia();

        matchMediaCtx.add(
            {
                reduced: reducedMotionQuery,
                mobile: `(prefers-reduced-motion: no-preference) and ${mobileBreakpoint}`,
                desktop: '(prefers-reduced-motion: no-preference) and (min-width: 761px)'
            },
            context => {
                const { reduced, mobile: isMobile } = context.conditions;
                if (reduced) {
                    root.classList.remove('is-interactive');
                    root.classList.add('is-reduced');
                    store?.destroy();
                    store = null;
                    canvas.classList.remove('is-ready');
                    poster?.classList.remove('is-hidden');

                    beats.forEach((beat, idx) => {
                        gsap.set(beat, { clearProps: 'all' });
                        beat.classList.toggle('is-active', idx === 0);
                    });
                    if (veil) gsap.set(veil, { clearProps: 'all' });
                    if (progressBar) gsap.set(progressBar, { clearProps: 'all' });
                    if (cue) gsap.set(cue, { clearProps: 'all' });
                    if (heroSection) {
                        for (const sel of ['.hero-copy', '.hero-portrait', '.portrait-outline', '.portrait-note']) {
                            const el = heroSection.querySelector(sel);
                            if (el) gsap.set(el, { clearProps: 'all' });
                        }
                    }

                    return () => {
                        root.classList.remove('is-reduced');
                    };
                }

                syncStageHeight();
                resizeCanvas();
                initStore(isMobile);

                root.classList.add('is-interactive');

                beats.forEach((beat, idx) => {
                    gsap.set(beat, {
                        opacity: idx === 0 ? 1 : 0,
                        y: idx === 0 ? 0 : 18,
                        visibility: 'visible'
                    });
                });
                if (veil) gsap.set(veil, { opacity: 0 });
                if (progressBar) gsap.set(progressBar, { scaleX: 0, transformOrigin: 'left center' });
                if (cue) gsap.set(cue, { opacity: 1, y: 0 });

                const getStableStageHeight = () => {
                    const h = stage.getBoundingClientRect().height || window.innerHeight || 720;
                    return Math.max(440, Math.round(h));
                };

                const frameProxy = { progress: 0 };
                const tl = gsap.timeline({
                    scrollTrigger: {
                        trigger: root,
                        pin: stage,
                        pinSpacing: true,
                        anticipatePin: 1,
                        invalidateOnRefresh: true,
                        fastScrollEnd: true,
                        scrub: isMobile ? 0.2 : 0.45,
                        start: () => `top ${getHeaderOffset()}px`,
                        end: () => `+=${Math.round(getStableStageHeight() * (isMobile ? 1.48 : 2.55))}`,
                        onRefresh: () => {
                            syncStageHeight();
                            resizeCanvas();
                            scheduleDraw(true);
                        },
                        onUpdate: self => {
                            currentProgress = self.progress;
                            const nextFrame = progressToFrameIndex(currentProgress, frameCount);
                            if (nextFrame !== currentTargetFrame) {
                                currentTargetFrame = nextFrame;
                                store?.setTargetFrame(nextFrame);
                            }
                            scheduleDraw(false);
                        }
                    }
                });

                tl.to(frameProxy, { progress: 1, duration: 1, ease: 'none' }, 0);

                if (progressBar) {
                    tl.to(progressBar, { scaleX: 1, duration: 1, ease: 'none' }, 0);
                }
                if (cue) {
                    tl.to(cue, { opacity: 0, y: -8, duration: 0.08, ease: 'power1.out' }, 0.01);
                }

                // Beat 0: 0% to 30%
                if (beats[0]) {
                    tl.to(beats[0], { opacity: 0, y: -16, duration: 0.09, ease: 'power2.inOut' }, 0.21);
                }
                // Beat 1: 30% to 70%
                if (beats[1]) {
                    tl.fromTo(
                        beats[1],
                        { opacity: 0, y: 18 },
                        { opacity: 1, y: 0, duration: 0.08, ease: 'power2.out' },
                        0.30
                    ).to(beats[1], { opacity: 0, y: -16, duration: 0.08, ease: 'power2.in' }, 0.61);
                }
                // Beat 2: 70% to 100%
                if (beats[2]) {
                    tl.fromTo(
                        beats[2],
                        { opacity: 0, y: 18 },
                        { opacity: 1, y: 0, duration: 0.08, ease: 'power2.out' },
                        0.70
                    ).to(beats[2], { opacity: 0, y: -12, duration: 0.08, ease: 'power2.in' }, 0.91);
                }

                if (veil) {
                    tl.to(veil, { opacity: 0.8, duration: 0.14, ease: 'power1.inOut' }, 0.86);
                }

                let heroTimeline = null;
                if (heroSection) {
                    const heroCopy = heroSection.querySelector('.hero-copy');
                    const heroPortrait = heroSection.querySelector('.hero-portrait');
                    const portraitOutline = heroSection.querySelector('.portrait-outline');
                    const portraitNote = heroSection.querySelector('.portrait-note');

                    heroTimeline = gsap.timeline({
                        scrollTrigger: {
                            trigger: heroSection,
                            start: isMobile ? 'top 95%' : 'top 92%',
                            end: isMobile ? 'top 55%' : 'top 28%',
                            scrub: isMobile ? 0.25 : 0.45,
                            invalidateOnRefresh: true
                        }
                    });

                    if (heroCopy) {
                        heroTimeline.fromTo(
                            heroCopy,
                            { opacity: isMobile ? 0.55 : 0.28, y: isMobile ? 16 : 26 },
                            { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' },
                            0
                        );
                    }
                    if (heroPortrait) {
                        heroTimeline.fromTo(
                            heroPortrait,
                            { opacity: isMobile ? 0.45 : 0.2, scale: 1.04, y: isMobile ? 16 : 24 },
                            { opacity: 1, scale: 1, y: 0, duration: 1, ease: 'power2.out' },
                            0
                        );
                    }
                    if (portraitOutline) {
                        heroTimeline.fromTo(
                            portraitOutline,
                            { opacity: 0, scale: 0.97 },
                            { opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out' },
                            0.1
                        );
                    }
                    if (portraitNote) {
                        heroTimeline.fromTo(
                            portraitNote,
                            { opacity: 0 },
                            { opacity: 1, duration: 0.7, ease: 'power1.out' },
                            0.25
                        );
                    }
                }

                return () => {
                    heroTimeline?.kill();
                    tl.kill();
                    store?.destroy();
                    store = null;
                    root.classList.remove('is-interactive');
                    canvas.classList.remove('is-ready');
                    poster?.classList.remove('is-hidden');
                };
            }
        );
    };

    const handleViewportChange = () => {
        if (disposed) return;
        const nextWidth = window.innerWidth || 0;
        if (mobileMq.matches && Math.abs(nextWidth - lastWindowWidth) < 2) {
            return;
        }
        lastWindowWidth = nextWidth;
        syncStageHeight();
        resizeCanvas();
        scheduleDraw(true);
        ScrollTrigger.refresh();
    };

    syncStageHeight();
    setupMatchMedia();

    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
            scheduleDraw(true);
        });
        resizeObserver.observe(stage);
    }

    window.addEventListener('resize', handleViewportChange, { passive: true });

    return {
        getProgress: () => currentProgress,
        getFrameIndex: () => currentTargetFrame,
        destroy() {
            disposed = true;
            window.removeEventListener('resize', handleViewportChange);
            resizeObserver?.disconnect();
            matchMediaCtx?.revert();
            store?.destroy();
            store = null;
        }
    };
}
