#!/usr/bin/env node
/**
 * Valgfritt kommandolinjeverktøy (Node 20+) for å kryptere/dekryptere ønskelistedata.
 * Det vanlige er å bruke redigeringsverktøyet i nettleseren (editor/index.html).
 *
 *   node tools/onskeliste.mjs krypter backup.json      → skriver data/wishlist.enc.js
 *   node tools/onskeliste.mjs dekrypter backup.json    → leser data/wishlist.enc.js og skriver klartekst
 *
 * Passordet hentes fra miljøvariabelen JUL_PASSORD, ellers blir du spurt.
 * NB: Ikke legg klartekst-filer (backup.json) inn i git-repoet!
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const { subtle } = globalThis.crypto;
const getRandomValues = (a) => globalThis.crypto.getRandomValues(a);
const ITERATIONS = 600000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = resolve(root, 'data/wishlist.enc.js');

const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function deriveKey(password, salt, iter = ITERATIONS) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function ask(question) {
  if (process.env.JUL_PASSORD) return Promise.resolve(process.env.JUL_PASSORD);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

function parsePayload(text) {
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

async function encrypt(input) {
  const data = JSON.parse(await readFile(input, 'utf8'));
  const password = await ask('Passord: ');
  let saltB64;
  try {
    // Behold salt fra eksisterende fil, slik at huskede innlogginger fortsatt virker
    saltB64 = parsePayload(await readFile(DATA_FILE, 'utf8')).salt;
  } catch { /* ny fil */ }
  const salt = saltB64 ? unb64(saltB64) : getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const iv = getRandomValues(new Uint8Array(12));
  data.updatedAt = new Date().toISOString();
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  const payload = { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ct)) };
  const out =
    '/*\n * Juleønsker – kryptert ønskelistedata (AES-256-GCM, PBKDF2-SHA-256).\n * Generert av redigeringsverktøyet. Ikke rediger for hånd.\n */\n' +
    'window.JUL_WISHLIST = ' + JSON.stringify(payload) + ';\n';
  await writeFile(DATA_FILE, out);
  console.log(`✓ Skrev ${DATA_FILE} (${data.wishes?.length ?? 0} ønsker)`);
}

async function decrypt(output) {
  const payload = parsePayload(await readFile(DATA_FILE, 'utf8'));
  const password = await ask('Passord: ');
  const key = await deriveKey(password, unb64(payload.salt), payload.iter);
  try {
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.data));
    const json = JSON.stringify(JSON.parse(new TextDecoder().decode(plain)), null, 2);
    if (output) { await writeFile(output, json); console.log(`✓ Skrev ${output}`); }
    else console.log(json);
  } catch {
    console.error('✗ Feil passord eller ødelagt fil');
    process.exit(1);
  }
}

const [cmd, file] = process.argv.slice(2);
if (cmd === 'krypter' && file) await encrypt(file);
else if (cmd === 'dekrypter') await decrypt(file);
else {
  console.log('Bruk:\n  node tools/onskeliste.mjs krypter <backup.json>\n  node tools/onskeliste.mjs dekrypter [backup.json]');
  process.exit(1);
}
