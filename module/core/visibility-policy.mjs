import { SessionStore } from "./session-store.mjs";

export class RollVisibilityPolicy {
    static getCurrentRollMode() {
        const mode = game.settings.get("core", "messageMode");
        const legacyModes = { public: "publicroll", gm: "gmroll", blind: "blindroll", self: "selfroll" };
        return legacyModes[mode] || mode || "publicroll";
    }

    static canViewParticipantRoll(participant, session) {
        if (!participant) return false;
        const isGM = Boolean(game.user?.isGM);
        const mode = participant.rollMode || session?.rollMode || "publicroll";
        const rollerId = participant.rollerUserId || session?.initiatorUserId || "";
        const isRoller = Boolean(rollerId && game.user?.id === rollerId);

        const actor = SessionStore.resolveActor(participant);
        const isOwner = Boolean(actor?.isOwner);

        if (mode === "blindroll") return isGM || Boolean(participant.rollerUserId && game.user?.id === participant.rollerUserId);
        if (mode === "gmroll") return isGM || isRoller || isOwner;
        if (mode === "selfroll") return isRoller || isOwner;
        return true;
    }
}
