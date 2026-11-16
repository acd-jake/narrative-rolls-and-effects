import { MODULE_ID, SOCKET_NAME } from "./constants.mjs";
import { SessionStore } from "./session-store.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

export class EffectsEngine {
    static #overlayElement = null;
    static #triggeredSessions = new Set();

    static PRESETS = Object.freeze({
        majorWound: { color: 0xb81414, secondaryColor: 0x5c0505, count: 28, durationMs: 1400, gravity: 0.14, spread: 2.6 },
        temporaryInsanity: { color: 0x7b2cbf, secondaryColor: 0x240046, count: 36, durationMs: 2000, gravity: -0.06, spread: 3.2 },
        indefiniteInsanity: { color: 0x4a0e4e, secondaryColor: 0x0d0221, count: 48, durationMs: 2600, gravity: -0.08, spread: 3.8 },
        mythosSpell: { color: 0x10b981, secondaryColor: 0x064e3b, count: 44, durationMs: 2200, gravity: -0.1, spread: 3.5 },
        dying: { color: 0x8a1c1c, secondaryColor: 0x1a0000, count: 20, durationMs: 1800, gravity: 0.18, spread: 1.8 }
    });

    static registerHooks() {
        Hooks.once("ready", () => {
            this.#createOverlay();
            this.syncPlayerAtmosphere();

            game.socket.on(SOCKET_NAME, (payload) => {
                if (payload?.action !== "playVisualEffect") return;
                const actor = payload.actorUuid ? fromUuidSync(payload.actorUuid) : game.actors.get(payload.actorId);
                if (actor) this.playEffectOnActorTokens(actor, payload.presetKey, { broadcast: false });
            });
        });

        Hooks.on("updateChatMessage", (message) => this.#onSessionUpdate(message));
        Hooks.on("updateActor", (actor, changed) => this.#onActorUpdate(actor, changed));
        Hooks.on("controlToken", () => this.syncPlayerAtmosphere());

        Hooks.on("roeConditionTriggered", (actor, conditionKey) => {
            if (actor && this.PRESETS[conditionKey]) {
                this.playEffectOnActorTokens(actor, conditionKey, { broadcast: true });
            }
        });
    }

    static #createOverlay() {
        if (this.#overlayElement) return;
        const overlay = document.createElement("div");
        overlay.id = "roe-screen-overlay";
        overlay.classList.add("roe-screen-overlay");
        document.body.appendChild(overlay);
        this.#overlayElement = overlay;
    }

    static syncPlayerAtmosphere() {
        if (!this.#overlayElement || !this.#isEnabled()) {
            this.#clearAtmosphereClasses();
            return;
        }
        const activeActor = canvas?.tokens?.controlled[0]?.actor ?? game.user?.character;
        const state = AdapterRegistry.active?.evaluateAtmosphereState(activeActor) ?? null;

        this.#clearAtmosphereClasses();
        if (state === "critical") this.#overlayElement.classList.add("vignette-madness");
        else if (state === "unease") this.#overlayElement.classList.add("vignette-unease");
    }

    static #onSessionUpdate(message) {
        const session = SessionStore.getSession(message);
        if (!session?.isResolved || this.#triggeredSessions.has(message.id)) return;
        this.#triggeredSessions.add(message.id);

        const adapter = AdapterRegistry.active;
        for (const p of session.participants ?? []) {
            if (!p.hasRolled) continue;
            const effectType = adapter?.getRollEffectType(p, session);
            if (effectType === "fumble") {
                this.triggerPulse("pulse-fumble");
                this.triggerScreenShake();
                if (game.user.isGM) this.playSound("fumbleSound", { broadcast: true });
                break;
            } else if (effectType === "critical") {
                this.triggerPulse("pulse-critical");
                if (game.user.isGM) this.playSound("criticalSound", { broadcast: true });
                break;
            }
        }
    }

    static #onActorUpdate(actor, changed) {
        this.syncPlayerAtmosphere();
        if (!actor.isOwner) return;

        const adapter = AdapterRegistry.active;
        if (adapter?.didTriggerLowResourceSound(actor, changed)) {
            this.playSound("lowResourceSound", { broadcast: false, volume: 0.9 });
        }
    }

    static playSound(settingKey, { broadcast = false, volume = 0.8 } = {}) {
        if (!game.settings?.settings.has(`${MODULE_ID}.${settingKey}`)) return;
        const soundPath = game.settings.get(MODULE_ID, settingKey);
        if (!soundPath) return;
        foundry.audio.AudioHelper.play({ src: soundPath, volume, loop: false }, broadcast);
    }

    static triggerPulse(cssClass) {
        if (!this.#overlayElement || !this.#isEnabled()) return;
        this.#overlayElement.classList.remove("pulse-fumble", "pulse-critical");
        void this.#overlayElement.offsetWidth;
        this.#overlayElement.classList.add(cssClass);
    }

    static triggerScreenShake() {
        if (!this.#isEnabled()) return;
        const board = document.getElementById("board");
        if (!board) return;
        board.classList.remove("roe-shake");
        void board.offsetWidth;
        board.classList.add("roe-shake");
    }

    static playEffectOnActorTokens(actor, presetKey, { broadcast = true } = {}) {
        if (!actor || !canvas?.ready) return;
        const preset = this.PRESETS[presetKey] ?? this.PRESETS.mythosSpell;
        for (const token of actor.getActiveTokens(true)) {
            this.#spawnTokenParticleBurst(token, preset);
        }
        if (broadcast) {
            game.socket.emit(SOCKET_NAME, { action: "playVisualEffect", actorId: actor.id, actorUuid: actor.uuid, presetKey });
        }
    }

    static #spawnTokenParticleBurst(token, preset) {
        const parentLayer = canvas.effects ?? canvas.stage;
        if (!parentLayer) return;

        const container = new PIXI.Container();
        container.x = token.center.x;
        container.y = token.center.y;
        parentLayer.addChild(container);

        const particles = [];
        const radius = Math.max(token.w, token.h) * 0.45;
        const ring = new PIXI.Graphics();
        ring.lineStyle(3, preset.color, 0.85);
        ring.drawCircle(0, 0, radius * 0.4);
        container.addChild(ring);

        for (let i = 0; i < preset.count; i++) {
            const gfx = new PIXI.Graphics();
            gfx.beginFill(i % 2 === 0 ? preset.color : preset.secondaryColor, 0.9);
            gfx.drawCircle(0, 0, 2 + Math.random() * 3.5);
            gfx.endFill();

            const angle = Math.random() * Math.PI * 2;
            const speed = (0.5 + Math.random() * 1.2) * preset.spread;
            gfx.x = (Math.random() - 0.5) * radius * 0.5;
            gfx.y = (Math.random() - 0.5) * radius * 0.5;
            particles.push({ gfx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
            container.addChild(gfx);
        }

        const startTime = performance.now();
        const tick = () => {
            const progress = Math.min(1, (performance.now() - startTime) / preset.durationMs);
            ring.scale.set(1 + progress * 1.8);
            ring.alpha = Math.max(0, 0.85 * (1 - progress));
            for (const p of particles) {
                p.vy += preset.gravity;
                p.gfx.x += p.vx;
                p.gfx.y += p.vy;
                p.gfx.alpha = Math.max(0, 1 - progress);
            }
            if (progress >= 1) {
                canvas.app.ticker.remove(tick);
                container.destroy({ children: true });
            }
        };
        canvas.app.ticker.add(tick);
    }

    static #clearAtmosphereClasses() {
        this.#overlayElement?.classList.remove("vignette-unease", "vignette-madness");
    }

    static #isEnabled() {
        return game.settings?.get(MODULE_ID, "enableVisualEffects") ?? true;
    }
}
