/**
 * ARCHIVO GENERADO por scripts/build-game-config.js.
 * Fuente: config/gameConfig.js. No editar a mano:
 *   npm run build:config
 */

/** Congela recursivamente para que el cliente no pueda mutar la config. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export const GAME_CONFIG = deepFreeze({
  "game": {
    "code": "TROPICAL_GRID_6X5_95_10K",
    "name": "Santa Crush",
    "engineVersion": "1.1.0",
    "paytableVersion": "TG65-95-10K-v2"
  },
  "grid": {
    "cols": 6,
    "rows": 5,
    "cells": 30,
    "minPaySize": 8,
    "minClusterSize": 8,
    "payTiers": [
      8,
      10,
      12
    ],
    "stripLength": 120,
    "stripRunLengths": [
      1,
      1,
      2,
      2,
      3,
      3,
      4
    ],
    "stripSeed": 2135587861
  },
  "symbols": {
    "scatter": "SC",
    "multiplier": "MX",
    "regular": [
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9"
    ],
    "singleRun": [
      "SC",
      "MX"
    ]
  },
  "strips": {
    "length": 120,
    "runLengths": [
      1,
      1,
      2,
      2,
      3,
      3,
      4
    ],
    "seed": 2135587861,
    "singleRunSymbols": [
      "SC",
      "MX"
    ]
  },
  "bets": {
    "ladderCredits": [
      0.1,
      0.2,
      0.5,
      1,
      2,
      5,
      10,
      20,
      50,
      100
    ],
    "minCredits": 0.1,
    "maxCredits": 100,
    "defaultCredits": 1,
    "defaultIndex": 3,
    "autoSpins": 10,
    "quickSpins": [
      5,
      10,
      25
    ]
  },
  "limits": {
    "maxExposureMultiplier": 10000,
    "maxExposureMicro": 100000000,
    "maxCascadeSteps": 40,
    "maxFeatureSpins": 10,
    "maxEngineAmountCents": 100000000
  },
  "feature": {
    "id": "TROPICAL_FEVER",
    "label": "Santa Crush",
    "costMultiplier": 100,
    "spins": 10
  },
  "rtp": {
    "target": 0.95,
    "base": 0.9508,
    "feature": 0.9498,
    "baseStandardError": 0.0037,
    "featureStandardError": 0.0016,
    "baseCi95": [
      0.9434,
      0.9581
    ],
    "featureCi95": [
      0.9466,
      0.953
    ],
    "simulatedRoundsBase": 1000000,
    "simulatedRoundsFeature": 500000,
    "simulatedSpinsFeature": 5000000,
    "calibratedAt": "2026-10-27"
  },
  "demo": {
    "enabledByDefault": true,
    "guestId": "invitado_demo",
    "guestName": "Invitado Demo",
    "currency": "VES",
    "startBalanceCents": 100000,
    "sessionTtlMs": 1800000,
    "tokenTtlSeconds": 7200,
    "maxSessions": 2000,
    "maxIdempotentRounds": 5
  },
  "api": {
    "baseUrl": "",
    "externalBaseUrl": "https://engine.latingames.net",
    "timeoutMs": 15000,
    "connectOrigins": [
      "https://engine.latingames.net"
    ]
  },
  "assets": {
    "basePath": "/assets/santa-crush/",
    "bg": {
      "desktop": "/assets/santa-crush/bg/bg-desktop.webp",
      "mobile": "/assets/santa-crush/bg/bg-mobile.webp"
    },
    "console": {
      "mobileFrame": "/assets/santa-crush/console/slot-frame-mobile.webp",
      "mobileConsole": "/assets/santa-crush/console/console-mobile.webp",
      "desktopFrame": "/assets/santa-crush/console/slot-frame.webp",
      "desktopConsole": "/assets/santa-crush/console/console-desktop.webp"
    },
    "tiles": {
      "dir": "/assets/santa-crush/tiles/",
      "files": [
        "tile-1.webp",
        "tile-2.webp",
        "tile-3.webp",
        "tile-4.webp",
        "tile-5.webp",
        "tile-6.webp"
      ]
    },
    "audio": {
      "bgm": "/assets/santa-crush/audio/bgm-holiday.mp3",
      "win": "/assets/santa-crush/audio/win-applause.mp3",
      "click": "/assets/santa-crush/audio/click.mp3"
    }
  }
});

/* Accesos directos por dominio (mismos objetos, sin duplicar valores). */
export const GAME = GAME_CONFIG.game;
export const GRID = GAME_CONFIG.grid;
export const SYMBOLS = GAME_CONFIG.symbols;
export const STRIPS = GAME_CONFIG.strips;
export const BETS = GAME_CONFIG.bets;
export const LIMITS = GAME_CONFIG.limits;
export const FEATURE = GAME_CONFIG.feature;
export const RTP = GAME_CONFIG.rtp;
export const DEMO = GAME_CONFIG.demo;
export const API = GAME_CONFIG.api;
export const ASSETS = GAME_CONFIG.assets;

export default GAME_CONFIG;
