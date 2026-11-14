/**
 * Punto de entrada del cliente visual.
 *
 * Composicion de la capa UI:
 *   - `ApiClient` (services): transporte HTTP, mismo origen o motor externo.
 *   - `SessionManager` (services): token, storage y sesion demo.
 *   - `GameController` (controllers): estado de apuesta y decisiones de flujo.
 *   - `GameView` + `RoundAnimator` (renderers): dibujado del payload.
 *   - `GameControls` (components): eventos de usuario -> acciones.
 *
 * El cliente no conoce el motor ni las probabilidades: todo lo que muestra
 * viene de /api/game (informacion publica) y de las respuestas de /api/spin.
 */

import { ApiClient, ApiError } from './services/ApiClient.js';
import { SessionManager } from './services/SessionManager.js';
import { createSfx } from './audio/sfx.js';
import { GameView } from './renderers/GameView.js';
import { GameController } from './controllers/GameController.js';
import { GameControls } from './components/GameControls.js';
import {
  applyGraphicsProfile,
  documentHidden,
  setDocumentHidden,
  watchVisibility
} from './lib/perf.js';
import { watchHudPlateDrift } from './lib/hudPlate.js';

function describe(error) {
  if (error instanceof ApiError) return error.message;
  if (error && error.message) return error.message;
  return 'Error inesperado.';
}

function bootstrap() {
  /* Perfil grafico antes del primer frame: `html.is-low-graphics` deja el
     tablero sin los filtros caros y `html.is-hidden` nace con el estado real de
     la pestana (un arranque en segundo plano no anima nada). */
  applyGraphicsProfile();
  setDocumentHidden(documentHidden());
  watchVisibility(setDocumentHidden);

  const ui = new GameView();
  ui.mount();
  /* El saldo se pinta desde la consola pero tiene que caer en la placa 1 del
     marco: se mide el desfase real al montar y en cada cambio de maqueta. */
  watchHudPlateDrift();

  let session = null;
  const api = new ApiClient({ getToken: () => (session ? session.current() : null) });
  session = new SessionManager(api);

  const sfx = createSfx();
  /* La musica ambiental suena por defecto desde el arranque: `autostart()` la
     intenta ya y engancha el primer gesto del jugador para los navegadores que
     exigen interaccion antes de reproducir audio. */
  sfx.autostart();
  const game = new GameController({ api, ui, sfx, session });
  new GameControls({ ui, controller: game }).mount();

  /* --- Arranque ---
     Sin token valido el cliente entra en modo prueba automaticamente: la
     maquina queda lista para girar con saldo virtual y sin modal previo. */
  const start = () => game.boot().catch(async (error) => {
    ui.setBusy(false);
    if (error && (error.code === 'SESSION_REQUIRED' || (error instanceof ApiError && error.isAuth))) {
      /* Sin token valido se entra en modo prueba. La puerta de token queda solo
         para cuando el servidor desactiva las fichas de prueba. */
      const demo = await game.startDemoMode({ silent: true });
      if (demo) return;

      if (!game.demoIsBlocked_()) {
        /* Fallo transitorio (red, 429, 5xx): no se pide token. */
        ui.setStatus('Modo prueba no disponible · reintenta');
        return;
      }

      ui.setStatus('Sesión requerida');
      ui.showAuthGate({
        onSubmit: (token) => {
          session.setToken(token);
          ui.setStatus('Verificando token…');
          start();
        },
        onDemo: () => {
          void game.startDemoMode();
        }
      });
      return;
    }
    ui.setStatus(`Sin conexión · ${(error && error.code) || 'ERROR'}`);
    ui.toast(describe(error), { type: 'error', timeout: 6000 });
    // eslint-disable-next-line no-console
    console.error('[tropical-grid] fallo de arranque:', error);
  });

  start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
