import { SOCKET_NAME } from "./constants.mjs";

export class SessionTransport {
  static registerGMListener(handlers) {
    Hooks.once("ready", () => {
      game.socket.on(SOCKET_NAME, async (payload) => {
        if (!game.user.isGM || !payload?.action) return;
        const handler = handlers[payload.action];
        if (handler) await handler(payload);
      });
    });
  }

  static emitToGM(action, data) {
    game.socket.emit(SOCKET_NAME, { action, ...data });
  }
}
