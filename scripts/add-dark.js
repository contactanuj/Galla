// One-shot: append dark: variants to neutral Tailwind tokens in className strings.
// Only structural neutrals (slate/white bg, text, border, divide) — accent colors
// (primary/rose/amber/emerald/violet/green/red) and text-white are left untouched.
const fs = require('fs');
const path = require('path');

const MAP = {
  'bg-slate-50': 'dark:bg-slate-950',
  'bg-white': 'dark:bg-slate-900',
  'bg-slate-100': 'dark:bg-slate-800',
  'bg-slate-200': 'dark:bg-slate-800',
  'text-slate-900': 'dark:text-slate-50',
  'text-slate-800': 'dark:text-slate-100',
  'text-slate-700': 'dark:text-slate-200',
  'text-slate-600': 'dark:text-slate-300',
  'text-slate-500': 'dark:text-slate-400',
  'text-slate-400': 'dark:text-slate-500',
  'text-slate-300': 'dark:text-slate-600',
  'border-slate-200': 'dark:border-slate-700',
  'border-slate-300': 'dark:border-slate-600',
  'border-slate-100': 'dark:border-slate-800',
  'divide-slate-100': 'dark:divide-slate-800',
  'divide-slate-200': 'dark:divide-slate-700',
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const root = path.join(__dirname, '..');
const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))];
let changed = 0, edits = 0;

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  let before = src;
  for (const [light, dark] of Object.entries(MAP)) {
    // standalone class token, not part of a longer token and not already dark:-prefixed
    const re = new RegExp(`(?<![\\w/:-])${light}(?![\\w/-])`, 'g');
    src = src.replace(re, (m) => { edits++; return `${light} ${dark}`; });
  }
  if (src !== before) { fs.writeFileSync(f, src); changed++; }
}
console.log(`Updated ${changed} files, ${edits} class tokens`);
