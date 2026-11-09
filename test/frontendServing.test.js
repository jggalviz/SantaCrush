'use strict';

/**
 * Modelo de servido del frontend.
 *
 * En Vercel el CDN publica `public/src/**` (y `/index.html`), mientras que `/`
 * lo atiende la funcion Express desde `server/generated/indexHtml.js`. En local
 * `npm start` sirve `public/` completo. Estas pruebas fijan ambos contratos.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { startServer, createClient } = require('./helpers/server');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('GET / responde el HTML aunque la funcion no sirva public/ (modelo Vercel)', async () => {
  const server = await startServer({ staticDir: null });
  const request = createClient(server.baseUrl);

  try {
    const response = await request('GET', '/');

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /^text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.text, INDEX_HTML);

    const asset = await request('GET', '/ui/main.js');
    assert.equal(asset.status, 404, 'En Vercel los estaticos los sirve el CDN');
    assert.equal(asset.body.error.code, 'NOT_FOUND');
  } finally {
    await server.close();
  }
});

test('en local (staticDir = public/) tambien se sirven los estaticos', async () => {
  const server = await startServer();
  const request = createClient(server.baseUrl);

  try {
    const index = await request('GET', '/index.html');
    assert.equal(index.status, 200);
    assert.equal(index.text, INDEX_HTML);

    const asset = await request('GET', '/ui/main.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') || '', /javascript/);

    const sound = await request('GET', '/src/assets/AUDIO-WIN-NEW-stadium-applause.MP3');
    assert.equal(sound.status, 200, 'Los aplausos de victoria deben servirse en local');
    assert.match(
      sound.headers.get('content-type') || '',
      /^audio\/mpeg/,
      'Express debe servir los aplausos con su MIME de audio'
    );
    assert.equal(
      Number(sound.headers.get('content-length')),
      fs.statSync(
        path.join(__dirname, '..', 'public', 'src', 'assets', 'AUDIO-WIN-NEW-stadium-applause.MP3')
      ).size,
      'El tamano servido debe coincidir con el asset de victoria'
    );

    const music = await request('GET', '/src/assets/Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3');
    assert.equal(music.status, 200, 'El bucle ambiental debe servirse en local');
    assert.match(
      music.headers.get('content-type') || '',
      /^audio\/mpeg/,
      'El bucle ambiental debe servirse con su MIME de audio'
    );
    assert.equal(
      Number(music.headers.get('content-length')),
      fs.statSync(
        path.join(
          __dirname,
          '..',
          'public',
          'src',
          'assets',
          'Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3'
        )
      ).size,
      'El tamano servido debe coincidir con el bucle ambiental'
    );
  } finally {
    await server.close();
  }
});
