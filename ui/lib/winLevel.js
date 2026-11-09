/**
 * Clasificacion visual de la ganancia segun multiplos de la apuesta.
 *
 * Es una decision de presentacion, no de pago: el importe siempre procede del
 * payload autoritativo del servidor. `betCents` solo elige la intensidad.
 */

export const LEVEL_LABEL = Object.freeze({
  win: 'GANANCIA',
  big: 'GRAN PREMIO',
  mega: 'MEGA',
  epic: '¡ÉPICA!'
});

export function winLevel(winCents, betCents) {
  if (!betCents || betCents <= 0) return { key: 'win', label: LEVEL_LABEL.win };
  const ratio = winCents / betCents;
  if (ratio >= 100) return { key: 'epic', label: LEVEL_LABEL.epic };
  if (ratio >= 25) return { key: 'mega', label: LEVEL_LABEL.mega };
  if (ratio >= 10) return { key: 'big', label: LEVEL_LABEL.big };
  return { key: 'win', label: LEVEL_LABEL.win };
}
