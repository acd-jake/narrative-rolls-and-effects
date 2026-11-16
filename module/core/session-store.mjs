import { MODULE_ID, FLAG_SESSION } from "./constants.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";
import { RollVisibilityPolicy } from "./visibility-policy.mjs";

export class SessionStore {
    static TEMPLATE = `modules/${MODULE_ID}/templates/chat/roll-session-card.hbs`;

    static getSession(message) {
        return message?.getFlag?.(MODULE_ID, FLAG_SESSION) ?? null;
    }

    static isSessionMessage(message) {
        return Boolean(this.getSession(message));
    }

    static resolveActor(source) {
        if (!source) return null;
        if (source instanceof Actor) return source;
        const uuid = typeof source === "string" ? source : source.actorUuid;
        if (uuid) {
            try {
                const doc = fromUuidSync(uuid);
                if (doc) return doc.actor ?? doc;
            } catch { /* Ignorieren bei nicht geladenen Szenen */ }
        }
        const actorId = typeof source === "object" ? source.actorId : null;
        return actorId ? game.actors?.get(actorId) ?? null : null;
    }

    static hasPlayerParticipant(participants) {
        const players = game.users.filter((u) => !u.isGM);
        return (participants ?? []).some((p) => {
            if (players.some((u) => u.id === p.rollerUserId)) return true;
            const actor = this.resolveActor(p);
            return Boolean(actor && players.some((u) => actor.testUserPermission(u, "OWNER")));
        });
    }

    static buildParticipant(key, actor, label, targetValue, itemId = "") {
        return {
            key,
            actorId: actor.id,
            actorUuid: actor.uuid,
            actorName: actor.name,
            actorImg: actor.img,
            itemId,
            label,
            targetValue,
            hasRolled: false,
            total: null,
            successLevel: "",
            isSuccess: false,
            modifierDice: 0,
            isPushed: false,
            luckDecided: false,
            rollMode: "publicroll",
            rollerUserId: "",
            rollBreakdown: null
        };
    }

    static async create(sessionConfig) {
        const adapter = AdapterRegistry.active;
        const rollMode = RollVisibilityPolicy.getCurrentRollMode();
        const isPreparing = Boolean(game.user.isGM && sessionConfig.prepareModifiers);
        const hasPlayers = this.hasPlayerParticipant(sessionConfig.participants);

        const sessionData = {
            systemId: game.system.id,
            rollType: sessionConfig.rollType,
            rollTypeLabel: game.i18n.localize(`ROE.RollSession.Types.${sessionConfig.rollType}`),
            phase: "rolling",
            initiatorUserId: game.user.id,
            rollMode,
            title: sessionConfig.title,
            difficulty: sessionConfig.difficulty ?? "regular",
            canChangeDifficulty: sessionConfig.canChangeDifficulty ?? true,
            canPush: sessionConfig.canPush ?? true,
            pushFailurePending: false,
            diceFormula: sessionConfig.diceFormula ?? "1d100",
            combinedMode: sessionConfig.combinedMode ?? "and",
            hasPendingConsequences: false,
            consequencesApplied: false,
            participants: sessionConfig.participants,
            hasPlayerParticipants: hasPlayers,
            isPreparingModifiers: isPreparing,
            isResolved: false,
            winnerKey: "",
            outcomeHeadline: "",
            ...(adapter?.getInitialSessionFields(sessionConfig) ?? {})
        };

        const templateData = adapter ? adapter.enrichSessionForTemplate(sessionData) : sessionData;
        const content = await foundry.applications.handlebars.renderTemplate(this.TEMPLATE, templateData);
        const speakerActor = this.resolveActor(sessionData.participants?.at(0));

        // Wenn SL noch Modifikatoren vorbereitet oder keine Spieler beteiligt sind: nur an GM flüstern
        const whisper = isPreparing || !hasPlayers ? ChatMessage.getWhisperRecipients("GM").map((u) => u.id) : [];

        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: speakerActor }),
            content,
            whisper,
            blind: false,
            flags: {
                [MODULE_ID]: {
                    [FLAG_SESSION]: sessionData,
                    noToast: true
                }
            }
        });
    }

    static async save(message, nextSession) {
        const adapter = AdapterRegistry.active;
        const updatedSession = {
            ...nextSession,
            hasPlayerParticipants: Boolean(nextSession.hasPlayerParticipants || this.hasPlayerParticipant(nextSession.participants))
        };

        const templateData = adapter ? adapter.enrichSessionForTemplate(updatedSession) : updatedSession;
        const content = await foundry.applications.handlebars.renderTemplate(this.TEMPLATE, templateData);

        const whisper = updatedSession.isPreparingModifiers || !updatedSession.hasPlayerParticipants
            ? ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
            : [];

        await message.update({
            content,
            whisper,
            [`flags.${MODULE_ID}.${FLAG_SESSION}`]: updatedSession
        });
    }
}
