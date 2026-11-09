/**
 * Reproduccion visual de una ronda resuelta por el servidor.
 *
 * Solo consume el payload autoritativo (`spins`, `totalWinCents`, `betCents`,
 * `audit`...). No pide datos, no calcula premios, no modifica saldo ni decide
 * apuestas: esa responsabilidad vive en `GameController` y `ApiClient`.
 */

import { LIMITS } from '../config/gameConfig.js';
import { formatCents, formatPlain } from '../lib/format.js';
import { TIMING, sleep } from '../lib/timing.js';
import { winLevel } from '../lib/winLevel.js';

export class RoundAnimator {
  /**
   * @param {object} options
   * @param {object} options.ui  renderer (`GameView`) con la API de dibujado
   * @param {object} options.sfx reproductor de efectos
   */
  constructor({ ui, sfx }) {
    this.ui = ui;
    this.sfx = sfx;
  }

  /**
   * @param {object} round payload de la ronda
   * @param {{ presentSpin?: Function }} [options] permite al controlador
   *   conservar sus propios hooks/decoradores de animacion
   */
  async present(round, { presentSpin } = {}) {
    const animateSpin = typeof presentSpin === 'function'
      ? presentSpin
      : (spin, context) => this.presentSpin(spin, context);
    const spins = Array.isArray(round.spins) ? round.spins : [];
    const isFeature = round.mode === 'BUY_FEATURE';
    const last = spins[spins.length - 1];

    if (round.replayed) {
      this.ui.clearHighlights();
      this.ui.renderGrid(
        last ? last.finalGrid : round.finalGrid,
        last ? last.bombs : round.bombs,
        { drop: false }
      );
      this.ui.setWin(round.totalWinCents);
      this.ui.setMultiplier(isFeature ? null : round.multiplier);
      this.ui.toast('Ronda ya registrada: no se ha vuelto a cobrar.', { type: 'info' });
      return;
    }

    this.ui.startSpinning();
    this.ui.setSpinTag(isFeature ? `Bonus · ${spins.length} giros` : 'Tirada');
    this.sfx.spin();
    await sleep(TIMING.reel);
    this.ui.setSpinTag(null);

    let runningWinCents = 0;
    for (let index = 0; index < spins.length; index += 1) {
      runningWinCents = await animateSpin(spins[index], {
        index,
        total: spins.length,
        isFeature,
        runningWinCents
      });
    }

    this.ui.setSpinTag(null);
    this.ui.clearHighlights();
    if (!isFeature) this.ui.setMultiplier(round.multiplier);

    const total = round.totalWinCents;
    const level = total > 0 ? winLevel(total, round.betCents) : null;

    if (level) {
      /* El conteo ascendente es solo visual; la cifra final es la del payload.
         `betCents` elige el perfil de intensidad de la capa: por debajo de 1x
         entra sutil y rapido, y de 10x en adelante con el efecto completo. */
      this.ui.setWin(total, { roll: true, level: level.key });
      this.ui.showBanner(level.key, formatCents(total));
      this.ui.celebrate(level.key, formatCents(total), { cents: total, betCents: round.betCents });
      this.sfx.win(level.key);
      const bannerMs = level.key === 'mega' || level.key === 'epic' ? 3400 : 2200;
      setTimeout(() => this.ui.hideBanner(), bannerMs);
    } else {
      this.ui.setWin(0);
    }

    if (round.maxWinReached) {
      this.ui.toast(
        `Tope de ganancia alcanzado: ${formatPlain(LIMITS.maxExposureMultiplier)}× la apuesta.`,
        { type: 'info' }
      );
    }
  }

  /**
   * Anima una tirada concreta (una en modo base, hasta 10 en el bonus).
   * @returns {Promise<number>} ganancia acumulada mostrada
   */
  async presentSpin(spin, { index, total, isFeature, runningWinCents = 0 }) {
    if (isFeature) {
      this.ui.setSpinTag(`Giro ${index + 1}/${total}`);
      await sleep(TIMING.settle);
    }

    this.ui.clearHighlights();
    const firstBombs = spin.cascades && spin.cascades.length ? spin.cascades[0].bombs : spin.bombs;
    /* `renderGrid` devuelve lo que tarda el tablero en entrar: con los rodillos
       girando es la parada escalonada completa (mas larga que `TIMING.drop`). */
    const landMs = this.ui.renderGrid(spin.initialGrid, firstBombs, { drop: true });
    this.sfx.drop(index);
    await sleep(Math.max(TIMING.drop, landMs || 0));

    /* Cada premio del giro debe sonar en el momento en que se paga. El flag
       evita duplicar el MP3 si el desglose ya lo disparo y solo deja el
       fallback para payloads sin cascadas/scatter detallados. */
    let winSoundPlayed = false;

    if (spin.scatter && spin.scatter.count >= 3) {
      this.ui.highlightCells(spin.scatter.cells, 'tile--scatter');
      this.sfx.cluster(12);
      if (spin.scatter.payCents > 0) {
        this.sfx.win();
        winSoundPlayed = true;
      }
      this.ui.toast(`Scatter ×${spin.scatter.count}: +${formatCents(spin.scatter.payCents)}`, {
        type: 'info',
        timeout: 2600
      });
      await sleep(TIMING.settle);
    }

    let running = runningWinCents;
    let bombsSeen = (firstBombs || []).length;

    for (const step of spin.cascades || []) {
      const cells = (step.clusters || []).flatMap((cluster) => cluster.cells);
      const biggest = (step.clusters || []).reduce((max, cluster) => Math.max(max, cluster.size), 8);

      this.ui.highlightCells(cells);
      this.sfx.cluster(biggest);
      await sleep(TIMING.hold);
      await this.ui.popCells(cells);

      running += step.winCents;
      this.ui.setWin(running, { roll: true });
      if (step.winCents > 0) {
        this.sfx.win();
        winSoundPlayed = true;
      }

      const bombsAfter = step.bombsAfter || [];
      const dropMs = this.ui.renderGrid(step.gridAfter, bombsAfter, { drop: true });
      if (bombsAfter.length > bombsSeen) {
        this.sfx.bomb();
        this.ui.shakeGrid();
      }
      bombsSeen = bombsAfter.length;
      this.sfx.drop(step.index + 1);
      await sleep(Math.max(TIMING.drop, dropMs || 0));
    }

    this.ui.clearHighlights();
    /* Fallback: un giro con premio positivo siempre deja oir la victoria,
       aunque el payload no traiga pasos de cascada con `winCents`. */
    if (!winSoundPlayed && spin.winCents > 0) this.sfx.win();
    /* En el bonus cada giro tiene su propio multiplicador de bombas. */
    if (isFeature) this.ui.setMultiplier(spin.multiplier);
    return running;
  }
}
