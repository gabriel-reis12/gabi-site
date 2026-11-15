import { mountJourneyScene } from './components/journey-scene.js';

const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-nav');
const mobile = window.matchMedia('(max-width: 960px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Inline disclosure, not a modal: normal tab order remains intact.
if (header && toggle && navigation) {
    header.classList.add('is-enhanced');
    toggle.hidden = !mobile.matches;
    const closeMenu = (restoreFocus = false) => {
        navigation.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('.menu-label').textContent = 'Menu';
        if (restoreFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.querySelector('.menu-label').textContent = open ? 'Fechar' : 'Menu';
        navigation.classList.toggle('is-open', open);
    });
    navigation.addEventListener('click', event => {
        const link = event.target.closest('a');
        if (!link) return;
        closeMenu();
        const href = link.getAttribute('href');
        if (href.startsWith('#')) {
            const target = document.getElementById(href.slice(1));
            if (target) {
                target.setAttribute('tabindex', '-1');
                target.focus({ preventScroll: true });
                target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
            }
        } else if (mobile.matches) toggle.focus();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
    });
    document.addEventListener('click', event => {
        if (!header.contains(event.target)) closeMenu();
    });
    header.addEventListener('focusout', event => {
        if (event.relatedTarget && !header.contains(event.relatedTarget)) closeMenu();
    });
    mobile.addEventListener('change', () => {
        const focusWillHide = document.activeElement === toggle;
        closeMenu();
        toggle.hidden = !mobile.matches;
        if (!mobile.matches && focusWillHide) navigation.querySelector('a').focus();
        if (mobile.matches && navigation.contains(document.activeElement)) toggle.focus();
    });
}

// One-shot motion with no hidden initial state and no persistent render loop.
if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-revealed');
                observer.unobserve(entry.target);
            }
        }
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    reducedMotion.addEventListener('change', event => {
        if (event.matches) {
            observer.disconnect();
            document.querySelectorAll('.is-revealed').forEach(element => element.classList.remove('is-revealed'));
        }
    });
}

// Supply a loader only when the real cinematic assets are ready.
mountJourneyScene(document.querySelector('[data-journey-scene]'));
