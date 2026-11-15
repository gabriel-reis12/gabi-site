import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the shipped controller without adding a DOM dependency to this static site.
// Browser layout, native keyboard behavior and assistive technology still need visual QA.
const source = (await readFile(new URL('../main.js', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/, '');
function fixture(isMobile = true) {
    const events = () => {
        const listeners = new Map();
        return { addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); }, emit(name, event = {}) { for (const callback of listeners.get(name) || []) callback(event); } };
    };
    const document = { ...events(), activeElement: null, querySelectorAll: () => [] };
    const element = () => {
        const values = new Set(); const attrs = new Map();
        return { ...events(), hidden: false, classList: { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value), toggle(value, force) { if (force) values.add(value); else values.delete(value); } }, getAttribute: name => attrs.get(name), setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name), focus() { document.activeElement = this; } };
    };
    const header = element(); const toggle = element(); const nav = element(); const target = element(); const link = element(); const label = {};
    toggle.setAttribute('aria-expanded', 'false');
    toggle.querySelector = () => label;
    link.setAttribute('href', '#sobre'); link.closest = () => link;
    nav.querySelector = () => link; nav.contains = el => el === link;
    header.contains = el => [header, toggle, nav, link].includes(el);
    document.querySelector = selector => ({ '.site-header': header, '.menu-toggle': toggle, '#site-nav': nav })[selector];
    document.getElementById = id => id === 'sobre' ? target : null;
    const mobile = { ...events(), matches: isMobile };
    const reduced = { ...events(), matches: true };
    runInNewContext(source, { document, window: { matchMedia: query => query.includes('960') ? mobile : reduced }, mountJourneyScene() {} });
    return { header, toggle, nav, target, link, label, document, mobile };
}

test('mobile disclosure toggles ARIA, label and visibility together', () => {
    const f = fixture(); assert.equal(f.toggle.hidden,false);
    f.toggle.emit('click');
    assert.equal(f.toggle.getAttribute('aria-expanded'),'true'); assert.equal(f.label.textContent,'Fechar'); assert.equal(f.nav.classList.contains('is-open'),true);
    f.toggle.emit('click');
    assert.equal(f.toggle.getAttribute('aria-expanded'),'false'); assert.equal(f.label.textContent,'Menu'); assert.equal(f.nav.classList.contains('is-open'),false);
});
test('Escape closes disclosure and returns focus to toggle', () => {
    const f = fixture(); f.toggle.emit('click'); f.link.focus();
    f.document.emit('keydown',{ key: 'Escape' });
    assert.equal(f.document.activeElement,f.toggle); assert.equal(f.nav.classList.contains('is-open'),false);
});
test('anchor activation closes navigation and moves focus to destination', () => {
    const f = fixture(); f.toggle.emit('click');
    f.nav.emit('click',{ target: f.link });
    assert.equal(f.document.activeElement,f.target); assert.equal(f.target.getAttribute('tabindex'),'-1'); assert.equal(f.nav.classList.contains('is-open'),false);
    f.target.emit('blur'); assert.equal(f.target.getAttribute('tabindex'),undefined);
});
test('tabbing outside header or clicking outside closes the disclosure', () => {
    const f = fixture(); f.toggle.emit('click');
    f.header.emit('focusout',{ relatedTarget: f.target }); assert.equal(f.nav.classList.contains('is-open'),false);
    f.toggle.emit('click'); f.document.emit('click',{ target: f.target }); assert.equal(f.nav.classList.contains('is-open'),false);
});
test('responsive transitions never leave focus in a hidden control', () => {
    const f = fixture(); f.toggle.focus(); f.mobile.matches = false; f.mobile.emit('change');
    assert.equal(f.toggle.hidden,true); assert.equal(f.document.activeElement,f.link);
    f.mobile.matches = true; f.mobile.emit('change');
    assert.equal(f.toggle.hidden,false); assert.equal(f.document.activeElement,f.toggle);
});
test('desktop starts with no mobile toggle', () => {
    const f = fixture(false); assert.equal(f.toggle.hidden,true); assert.equal(f.header.classList.contains('is-enhanced'),true);
});
