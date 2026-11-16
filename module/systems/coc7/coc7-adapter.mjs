import { MODULE_ID } from "../../core/constants.mjs";
import { SessionStore } from "../../core/session-store.mjs";
import { CoC7Interceptor } from "./coc7-interceptor.mjs";
import { CoC7DataMapper } from "./coc7-data-mapper.mjs";
import { CoC7CheckResolver } from "./coc7-check-resolver.mjs";
import { CoC7ResultFormatter } from "./coc7-result-formatter.mjs";
import { CoC7DiceVisualizer } from "./coc7-dice-visualizer.mjs";
import { CoC7SessionFactory } from "./coc7-session-factory.mjs";
import { RollVisibilityPolicy } from "../../core/visibility-policy.mjs";
import { BasicRollStrategy } from "./strategies/basic-roll-strategy.mjs";
import { SkillRollStrategy } from "./strategies/skill-roll-strategy.mjs";
import { CombinedRollStrategy } from "./strategies/combined-roll-strategy.mjs";
import { OpposedRollStrategy } from "./strategies/opposed-roll-strategy.mjs";
import { SanityRollStrategy } from "./strategies/sanity-roll-strategy.mjs";
import { CombatRollStrategy } from "./strategies/combat-roll-strategy.mjs";
import { RangedRollStrategy } from "./strategies/ranged-roll-strategy.mjs";

export class CoC7Adapter {
    #strategies;

    constructor() {
        this.#strategies = Object.freeze({
            basic: new BasicRollStrategy(),
            other: new BasicRollStrategy(),
            skill: new SkillRollStrategy(),
            combined: new CombinedRollStrategy(),
            opposed: new OpposedRollStrategy(),
            sanity: new SanityRollStrategy(),
            combat: new CombatRollStrategy(),
            ranged: new RangedRollStrategy()
        });
    }

    initialize() {
        CoC7Interceptor.register();
    }

    getStrategy(rollType) {
        return this.#strategies[rollType] ?? this.#strategies.basic;
    }

    buildSessionPayload(type, cfg) {
        const builders = {
            basic: () => CoC7SessionFactory.createBasicOrOther(cfg),
            skill: () => CoC7SessionFactory.createSkillCheck(cfg),
            combined: () => CoC7SessionFactory.createCombined(cfg),
            opposed: () => CoC7SessionFactory.createOpposed(cfg),
            sanity: () => CoC7SessionFactory.createSanityCheck(cfg),
            combat: () => CoC7SessionFactory.createCombat(cfg),
            ranged: () => CoC7SessionFactory.createRanged(cfg)
        };
        return builders[type]();
    }

    getInitialSessionFields(cfg) {
        return {
            sanityLossSuccess: cfg.sanityLossSuccess ?? "0",
            sanityLossFailure: cfg.sanityLossFailure ?? "1d6",
            sanityLost: null,
            sanityTriggersBout: false,
            sanityTriggersIndefinite: false,
            sanityPermanentInsanity: false,
            boutDurationRounds: null,
            tempInsanityHours: null,
            combatPhase: cfg.combatPhase ?? "initiator",
            combatType: cfg.combatType ?? "melee",
            weaponName: cfg.weaponName ?? "",
            weaponImg: cfg.weaponImg ?? "",
            damageFormula: cfg.damageFormula ?? "1d6",
            damageBonus: cfg.damageBonus ?? "0",
            tacticalFlags: cfg.tacticalFlags ?? { outnumbered: false, surprised: false, pointBlank: false, cover: false, proneTarget: false },
            defenderReaction: cfg.defenderReaction ?? "dodge",
            defenderWeaponId: cfg.defenderWeaponId ?? "",
            maneuverType: cfg.maneuverType ?? "disarm",
            defenderDodgeValue: cfg.defenderDodgeValue ?? 0,
            defenderFightBackValue: cfg.defenderFightBackValue ?? 0,
            hitWinnerKey: "",
            rawDamage: null,
            armorApplied: 0,
            finalDamage: null,
            majorWoundTriggered: false
        };
    }

    enrichSessionForTemplate(session) {
        return CoC7SessionFactory.enrichForTemplate(session);
    }

    collectActorChecks(actor, options = {}) {
        return CoC7SessionFactory.collectActorChecks(actor, options);
    }

    validateSubmittedRoll(session, participant, rollData) {
        if (session.rollType === "other" || participant.key === "damage") return true;
        if (participant.key === "defender" && (session.rollType === "ranged" || session.defenderReaction === "none")) return true;

        let expected = Number(participant.modifierDice ?? 0);
        if (session.rollType === "combat" && participant.key === "attacker") {
            const f = session.tacticalFlags ?? {};
            expected += Number(Boolean(f.outnumbered)) + Number(Boolean(f.surprised)) +
                Number(Boolean(f.pointBlank)) + Number(Boolean(f.proneTarget)) - Number(Boolean(f.cover));
        }
        if (session.rollType === "ranged" && participant.key === "attacker") {
            if (session.participants.find((e) => e.key === "defender")?.tookCover) expected--;
        }
        return Number(rollData.modifierDice ?? 0) === Math.clamp(expected, -2, 2);
    }

    async executePushRoll(session, participantKey) {
        if (!CoC7CheckResolver.canPush(session, participantKey)) return null;
        const participant = session.participants.find((p) => p.key === participantKey);
        const modifierDice = Number(participant.modifierDice ?? 0);
        const roll = await new Roll(CoC7CheckResolver.buildRollFormula(modifierDice)).evaluate();
        return {
            total: roll.total === 0 ? 100 : roll.total,
            modifierDice,
            rollMode: RollVisibilityPolicy.getCurrentRollMode(),
            rollerUserId: game.user.id,
            rollBreakdown: CoC7CheckResolver.buildBreakdown(roll, 0, "", { modifierDice })
        };
    }

    transformSessionPatch(session, patch) {
        if (patch.resetCombatPhase || patch.resetSanityPhase) {
            if (session.consequencesApplied) return session;
            const clear = {
                hasRolled: false, total: null, successLevel: "", isSuccess: false,
                isPushed: false, luckDecided: false, luckSpent: 0, rollBreakdown: null
            };
            if (patch.resetCombatPhase && session.rollType === "combat") {
                const key = { initiator: "attacker", opponent: "defender" }[patch.resetCombatPhase];
                if (!key || !session.participants.find((p) => p.key === key)?.hasRolled) return session;
                return {
                    ...session,
                    participants: session.participants.filter((p) => p.key !== "damage")
                        .map((p) => p.key === key ? { ...p, ...clear } : p),
                    combatPhase: "initiator", phase: "rolling", hitWinnerKey: "", rawDamage: null,
                    armorApplied: 0, finalDamage: null, majorWoundTriggered: false,
                    hasPendingConsequences: false, winnerKey: "", outcomeHeadline: ""
                };
            }
            if (patch.resetSanityPhase && session.rollType === "sanity") {
                const key = { check: "p0", insight: "insanityInt" }[patch.resetSanityPhase];
                if (!key || !session.participants.find((p) => p.key === key)?.hasRolled) return session;
                const participants = session.participants.filter((p) => key !== "p0" || p.key !== "insanityInt")
                    .map((p) => p.key === key ? { ...p, ...clear } : p);
                const sanity = key === "p0"
                    ? {
                        sanityLost: null, sanityTriggersBout: false, sanityTriggersIndefinite: false,
                        sanityPermanentInsanity: false, boutDurationRounds: null, tempInsanityHours: null,
                        hasPendingConsequences: false
                    }
                    : { boutDurationRounds: null, tempInsanityHours: null, hasPendingConsequences: true };
                return { ...session, ...sanity, participants, phase: "rolling", winnerKey: "", outcomeHeadline: "" };
            }
            return session;
        }

        if (session.rollType === "combat" && ("defenderReaction" in patch || "reactionDetail" in patch)) {
            const defender = session.participants.find((p) => p.key === "defender");
            if (!defender || defender.hasRolled) return session;
            if ("defenderReaction" in patch) {
                const reaction = patch.defenderReaction;
                if (!["dodge", "fightBack", "maneuver", "none"].includes(reaction)) return session;
                const targetValue = reaction === "dodge" ? session.defenderDodgeValue
                    : reaction === "fightBack" || reaction === "maneuver" ? session.defenderFightBackValue : 0;
                return {
                    ...session, defenderReaction: reaction,
                    participants: session.participants.map((p) => p.key === "defender"
                        ? {
                            ...p, label: game.i18n.localize(`ROE.Combat.DefenseModes.${reaction}`), targetValue,
                            hasRolled: false, total: null, successLevel: "", isSuccess: false
                        }
                        : p)
                };
            }
            const detail = patch.reactionDetail;
            if (session.defenderReaction === "maneuver") {
                return ["disarm", "grapple", "knockdown", "push"].includes(detail)
                    ? { ...session, maneuverType: detail } : session;
            }
            if (session.defenderReaction === "fightBack") {
                const actor = SessionStore.resolveActor(defender);
                const weapon = detail === "unarmed" ? null : actor?.items.get(detail);
                if (!actor || (detail !== "unarmed" && weapon?.type !== "weapon")) return session;
                const skill = CoC7DataMapper.findActorSkill(actor, weapon
                    ? weapon.system?.skill?.main
                    : { name: game.i18n.localize("ROE.SkillList.FightingBrawl") });
                const label = weapon
                    ? `${weapon.name} (${skill?.name || game.i18n.localize("ROE.Combat.DefenseTabs.fightBack")})`
                    : game.i18n.localize("ROE.Combat.DefenseModes.fightBack");
                return {
                    ...session, defenderWeaponId: detail,
                    participants: session.participants.map((p) => p.key === "defender"
                        ? {
                            ...p, itemId: weapon?.id ?? "", label,
                            targetValue: skill ? CoC7DataMapper.getSkillValue(skill) : session.defenderFightBackValue
                        }
                        : p)
                };
            }
            return session;
        }
        return { ...session, ...patch };
    }

    /**
     * Verarbeitet Post-Roll-Aktionen (Glück ausgeben, Glück ablehnen, Probe forcieren, Forcieren-Folgen bestätigen).
     */
    async handlePostRollAction(session, participantKey, actionId, payload) {
        if (actionId === "spendLuck") {
            const target = session.participants.find((p) => p.key === participantKey);
            if (!target || target.isPushed) return null;

            const actor = SessionStore.resolveActor(target);
            const currentLuck = CoC7DataMapper.getResource(actor, "luck")?.value ?? 0;
            const cost = Number(payload.cost);
            if (!actor || currentLuck < cost) return null;

            const remainingLuck = currentLuck - cost;
            await actor.update({ "system.attribs.lck.value": remainingLuck });

            const rank = CoC7CheckResolver.LEVEL_RANK;
            const isSuccess = (rank[payload.newLevel] ?? 0) >= (rank[session.difficulty] ?? 2);
            const canUpgradeMore = this.#canUpgradeFurther(target.total, target.targetValue, payload.newLevel, remainingLuck);

            const participants = session.participants.map((p) =>
                p.key === participantKey
                    ? { ...p, successLevel: payload.newLevel, isSuccess, luckSpent: (p.luckSpent ?? 0) + cost, luckDecided: !canUpgradeMore }
                    : p
            );
            return { session: { ...session, participants }, finalize: true };
        }

        if (actionId === "declineLuck") {
            const participants = session.participants.map((p) =>
                p.key === participantKey ? { ...p, luckDecided: true } : p
            );
            return { session: { ...session, participants }, finalize: false };
        }

        if (actionId === "pushRoll") {
            const participants = CoC7CheckResolver.buildPushedParticipants(session, participantKey, payload.rollData);
            if (!participants) return null;
            return { session: { ...session, participants }, finalize: true };
        }

        if (actionId === "acknowledgePushFailure" && game.user.isGM) {
            return {
                session: { ...session, pushFailurePending: false, phase: "awaitingResolution" },
                finalize: false
            };
        }

        return null;
    }

    evaluateParticipantOptions(participant, session, isDelegatedToPlayer) {
        if (!participant?.hasRolled || session.isResolved || session.rollType === "other") {
            return { canSpendLuck: false, luckCost: 0, luckTargetLevel: "", luckTargetLabel: "", canPush: false, isDelegatedToPlayer };
        }

        const actor = SessionStore.resolveActor(participant);
        if (!actor || (!game.user.isGM && !actor.isOwner)) {
            return { canSpendLuck: false, luckCost: 0, luckTargetLevel: "", luckTargetLabel: "", canPush: false, isDelegatedToPlayer };
        }

        const level = participant.successLevel;
        const isPushed = Boolean(participant.isPushed);
        const availableLuck = CoC7DataMapper.getResource(actor, "luck")?.value ?? 0;
        let luckCost = 0;
        let luckTargetLevel = "";

        if (!participant.luckDecided && !isPushed && level !== "fumble" && level !== "critical" && availableLuck > 0) {
            const allowImprove = this.#isLuckImprovementAllowed();
            let desiredLevel = "";
            if (!participant.isSuccess) desiredLevel = session.difficulty || "regular";
            else if (allowImprove) {
                if (level === "regular") desiredLevel = "hard";
                else if (level === "hard") desiredLevel = "extreme";
            }

            if (desiredLevel) {
                const threshold = this.getDifficultyThreshold(participant.targetValue, desiredLevel);
                const needed = participant.total - threshold;
                if (needed > 0 && needed <= availableLuck) {
                    luckCost = needed;
                    luckTargetLevel = desiredLevel;
                }
            }
        }

        return {
            canSpendLuck: luckCost > 0,
            luckCost,
            luckTargetLevel,
            luckTargetLabel: luckTargetLevel ? game.i18n.localize(`ROE.SuccessLevels.${luckTargetLevel}`) : "",
            canPush: CoC7CheckResolver.canPush(session, participant.key),
            isDelegatedToPlayer
        };
    }

    getDifficultyThreshold(target, difficulty) {
        if (difficulty === "hard") return Math.floor(target / 2);
        if (difficulty === "extreme") return Math.floor(target / 5);
        return target;
    }

    formatRollOutcome(params) {
        return CoC7ResultFormatter.formatRollOutcome(params);
    }

    getDiceVisuals(session, mod) {
        return session?.rollType === "other" ? CoC7DiceVisualizer.fromFormula(session.diceFormula) : CoC7DiceVisualizer.percentile(mod);
    }

    // EffectsEngine-Schnittstellen
    evaluateAtmosphereState(actor) {
        const san = CoC7DataMapper.getResource(actor, "sanity");
        if (!san || typeof san.value !== "number") return null;
        if (san.value <= 20) return "critical";
        if (san.value <= 45) return "unease";
        return null;
    }

    getRollEffectType(participant) {
        if (participant.successLevel === "fumble") return "fumble";
        if (participant.successLevel === "critical") return "critical";
        if (participant.isPushed && !participant.isSuccess) return "fumble";
        return null;
    }

    didTriggerLowResourceSound(actor, changed) {
        const newSanity = changed.system?.attribs?.san?.value;
        return typeof newSanity === "number" && newSanity <= 20;
    }

    #isLuckImprovementAllowed() {
        for (const key of ["spendLuck", "luckImprovement", "allowLuckImprovement"]) {
            if (game.settings?.settings.has(`CoC7.${key}`)) {
                return Boolean(game.settings.get("CoC7", key));
            }
        }
        return false;
    }

    #canUpgradeFurther(total, targetValue, currentLevel, remainingLuck) {
        if (remainingLuck <= 0 || !this.#isLuckImprovementAllowed()) return false;
        const nextThreshold = currentLevel === "regular"
            ? Math.floor(targetValue / 2)
            : currentLevel === "hard"
                ? Math.floor(targetValue / 5)
                : null;
        if (nextThreshold === null) return false;
        const needed = total - nextThreshold;
        return needed > 0 && needed <= remainingLuck;
    }
}