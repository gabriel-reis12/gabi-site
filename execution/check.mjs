import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const css = await readFile(resolve(root, 'styles.css'), 'utf8');
const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
assert.ok(canonical && new URL(canonical).protocol === 'https:', 'HTTPS canonical required');
assert.ok(html.includes(`property="og:url" content="${canonical}"`), 'Canonical and OG URL must match');
const person = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(person.url, canonical);
assert.equal(person.identifier.value, '06/215390');
assert.equal(person.telephone, '+5519993730000');
assert.ok((await readFile(resolve(root, 'sitemap.xml'), 'utf8')).includes(`<loc>${canonical}</loc>`));
assert.ok((await readFile(resolve(root, 'robots.txt'), 'utf8')).includes(`Sitemap: ${canonical}sitemap.xml`));
const records = JSON.parse(await readFile(resolve(root, 'directives/professional-content.json'), 'utf8'));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML ids');
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'One h1 is required');
assert.match(html, /<html lang="pt-BR">/);
assert.match(html, /<main id="conteudo"/);
assert.doesNotMatch(html, /\?\?|\uFFFD|PROFESSIONAL_RECORDS/);

for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(anchor), `Missing anchor: ${anchor}`);
for (const [, labels] of html.matchAll(/aria-(?:labelledby|controls)="([^"]+)"/g)) {
    for (const id of labels.split(' ')) assert.ok(ids.includes(id), `Missing ARIA target: ${id}`);
}
const localPaths = new Set([...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(path => !/^(https?:|mailto:|data:)/.test(path)));
for (const [, set] of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const candidate of set.split(',')) localPaths.add(candidate.trim().split(/\s+/)[0]);
}
for (const path of localPaths) await access(resolve(root, path));
for (const [image] of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(image, /alt="[^"]+"/);
    assert.match(image, /width="\d+"/);
    assert.match(image, /height="\d+"/);
}
for (const [link] of html.matchAll(/<a\b[^>]*>/g)) {
    if (link.includes('target="_blank"')) assert.match(link, /rel="noopener noreferrer"/);
    if (link.includes('wa.me')) assert.match(link, /href="https:\/\/wa.me\/5519993730000"/);
}
assert.match(html, /mailto:gabysarra23@gmail.com/);
assert.match(html, /CRP 06\/215390/);
assert.match(html, /50 minutos/);
assert.match(html, /Atendimento exclusivamente online/);
for (const record of records) for (const value of Object.values(record)) assert.ok(html.includes(value), `Professional content changed: ${value}`);
assert.doesNotMatch(html, /brain\.jpg|Imagens Intro|testimonial|Mãe 0|Paciente 0/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /:focus-visible/);
assert.doesNotMatch(css, /animation:[^;}]*infinite/);

// Lightweight structural lint, not a substitute for browser rendering.
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const stack = [];
for (const [, slash, tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    if (voidTags.has(tag)) continue;
    if (slash) assert.equal(stack.pop(), tag, `Unbalanced HTML at ${tag}`);
    else stack.push(tag);
}
assert.equal(stack.length, 0, 'Unclosed HTML tags');
let braces = 0;
for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') braces++;
    if (char === '}') braces--;
    assert.ok(braces >= 0, 'Unexpected CSS brace');
}
assert.equal(braces, 0, 'Unbalanced CSS rules');
const variables = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
for (const [, variable] of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(variables.has(variable), `Missing token ${variable}`);
for (const path of ['main.js','components/journey-scene.js','components/BrainScrollExperience.js','execution/serve.mjs']) {
    const result = spawnSync(process.execPath, ['--check', resolve(root, path)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
}
for (const tier of ['intro-desktop', 'intro-mobile']) {
    for (let i = 1; i <= 287; i++) {
        const padded = String(i).padStart(3, '0');
        await access(resolve(root, `Imagens/optimized/${tier}/frame-${padded}.webp`));
    }
}

function luminance(hex) {
    const rgb = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value,16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const pairs = [['ivory on espresso','#f1e8df','#100c0a'],['muted on hero glow','#c0afa1','#35241c'],['body on ivory','#6c584b','#f1e8df'],['body on process','#6c584b','#e4d5c6'],['accent on ivory','#765239','#f1e8df'],['accent on process','#765239','#e4d5c6'],['body on chocolate','#d6c5b8','#33231c'],['CTA','#100c0a','#d5b594']];
for (const [label, foreground, background] of pairs) {
    const a = luminance(foreground); const b = luminance(background);
    const ratio = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
    assert.ok(ratio >= 4.5, `${label}: insufficient contrast ${ratio}`);
    console.log(`Contrast ${label}: ${ratio.toFixed(2)}:1`);
}
console.log(`PASS: ${ids.length} ids, ${localPaths.size} local assets, 9 original professional records, contact links, HTML structure, CSS tokens, JS syntax.`);
