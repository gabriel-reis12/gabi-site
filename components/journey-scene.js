/**
 * Progressive boundary for the future A → B → C renderer.
 * HTML is the complete fallback; no assets are requested here.
 * Optional loader: async ({ mount, signal }) => ({ destroy() }).
 * Resolve after the first frame is ready. Reject/abort to keep the photograph.
 */
export function mountJourneyScene(root, { loadExperience } = {}) {
    if (!root || typeof loadExperience !== 'function') return () => {};
    const mount = root.querySelector('[data-journey-mount]');
    const fallback = root.querySelector('[data-journey-fallback]');
    if (!mount || !fallback) return () => {};
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 760px)');
    const connection = navigator.connection;
    let renderer;
    let request;
    let nearViewport = false;
    let disposed = false;
    const stop = () => {
        request?.abort();
        request = undefined;
        try { renderer?.destroy(); } catch { /* A renderer failure must not remove the fallback. */ } finally {
            renderer = undefined;
            mount.hidden = true;
            fallback.hidden = false;
            mount.replaceChildren();
        }
    };
    const sync = async () => {
        if (disposed) return;
        if (reduced.matches || mobile.matches || connection?.saveData || !nearViewport) {
            stop();
            return;
        }
        if (renderer || request) return;
        const pending = new AbortController();
        request = pending;
        // An isolated staging host prevents stale asynchronous renderer writes.
        const staging = document.createElement('div');
        staging.className = 'journey-renderer';
        mount.append(staging);
        try {
            const ready = await loadExperience({ mount: staging, signal: pending.signal, bounds: root.getBoundingClientRect() });
            if (pending.signal.aborted || disposed) {
                ready?.destroy?.();
                staging.remove();
                return;
            }
            if (!ready || typeof ready.destroy !== 'function') throw new TypeError('A scene renderer must expose destroy().');
            renderer = ready;
            mount.hidden = false;
            fallback.hidden = true;
        } catch {
            if (!pending.signal.aborted && request === pending) stop();
            staging.remove();
        } finally {
            if (request === pending) request = undefined;
        }
    };
    reduced.addEventListener('change', sync);
    mobile.addEventListener('change', sync);
    connection?.addEventListener?.('change', sync);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
        nearViewport = entries.some(entry => entry.isIntersecting);
        void sync();
    }, { rootMargin: '200px' }) : null;
    // No observer: keep the fallback instead of eager loading.
    observer?.observe(root);
    return () => {
        disposed = true;
        observer?.disconnect();
        reduced.removeEventListener('change', sync);
        mobile.removeEventListener('change', sync);
        connection?.removeEventListener?.('change', sync);
        stop();
    };
}
