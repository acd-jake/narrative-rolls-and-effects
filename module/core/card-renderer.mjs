import { SessionStore } from "./session-store.mjs";
import { RollVisibilityPolicy } from "./visibility-policy.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

export class SessionCardRenderer {
    static registerHooks() {
        Hooks.on("renderChatMessageHTML", (message, html) => {
            if (SessionStore.isSessionMessage(message)) {
                this.applyClientFormatting(message, html);
            }
        });
    }

    static applyClientFormatting(message, html) {
        const isGM = Boolean(game.user?.isGM);
        const sys = SessionStore.getSession(message);
        const adapter = AdapterRegistry.active;
        if (!sys) return;

        const participants = sys.participants ?? [];
        const allRolled = participants.length > 0 && participants.every((p) => p.hasRolled);

        const enriched = participants.map((p) => {
            const actor = SessionStore.resolveActor(p);
            const isOwner = Boolean(actor?.isOwner);
            const opts = !isGM && isOwner && p.hasRolled ? adapter?.evaluateParticipantOptions(p, sys, false) : null;
            return { ...p, actor, isOwner, hasPendingAction: Boolean(opts?.canSpendLuck) };
        });

        const hasPendingOwnDecision = !isGM && enriched.some((p) => p.isOwner && p.hasPendingAction);
        const canRevealResults = isGM || Boolean(sys.isResolved) || (allRolled && !hasPendingOwnDecision);

        for (const p of enriched) {
            if (!p.hasRolled) continue;

            const badge = html.querySelector(`[data-participant-key="${p.key}"] .roll-badge`);
            if (!badge) continue;

            if (p.total === null) {
                badge.textContent = game.i18n.localize("ROE.Combat.DefenseTabs.none");
                badge.className = "pending-badge";
                continue;
            }

            const canViewRoll = RollVisibilityPolicy.canViewParticipantRoll(p, sys);
            const showDetails = canViewRoll && (isGM || p.isOwner || canRevealResults);

            if (!canViewRoll) {
                badge.textContent = game.i18n.localize("ROE.RollSession.HiddenRoll");
                badge.className = "pending-badge";
            } else if (!showDetails) {
                badge.textContent = game.i18n.localize("ROE.Combat.Card.HiddenUntilOwnRoll");
                badge.className = "pending-badge";
            } else if (p.key === "damage") {
                badge.textContent = `${p.total} (${p.diceFormula})`;
            } else if (sys.rollType === "other") {
                badge.textContent = String(p.total);
            } else {
                const allowNumbers = isGM || Boolean(p.actor?.testUserPermission(game.user, "OBSERVER"));
                badge.textContent = adapter
                    ? adapter.formatRollOutcome({ total: p.total, targetValue: p.targetValue, successLevel: p.successLevel, allowNumbers })
                    : String(p.total);
            }

            if (showDetails && p.rollBreakdown) {
                badge.classList.add("is-inspectable");
                badge.title = game.i18n.localize("ROE.Roll.ClickToInspect");
                badge.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.toggleBreakdownForElement(badge.closest("[data-participant-key]"), p);
                });
            }
        }

        const resultBody = html.querySelector(".result-section .section-body");
        if (resultBody && sys.outcomeHeadline && !canRevealResults) {
            resultBody.innerHTML = `<div class="pending-badge">${game.i18n.localize("ROE.Combat.Card.AwaitingResolution")}</div>`;
            html.querySelector(".result-badge-row")?.remove();
        }

        const toggleBtn = html.querySelector(".resolved-summary-toggle");
        const drawer = html.querySelector(".card-details-drawer");
        if (toggleBtn && drawer) {
            toggleBtn.addEventListener("click", (ev) => {
                ev.preventDefault();
                const expanded = drawer.classList.toggle("is-expanded");
                toggleBtn.setAttribute("aria-expanded", String(expanded));
            });
        }
    }

    static toggleBreakdownForElement(container, participant) {
        if (!container || !participant?.rollBreakdown) return;

        const existing = container.querySelector(".roll-inspect-box");
        if (existing) {
            existing.remove();
            return;
        }

        const bd = participant.rollBreakdown;
        const diceHtml = (bd.diceTerms ?? [])
            .map((term) => {
                const faces = term.results
                    .map((r) => `<span class="die-face ${r.active ? "is-kept" : "is-dropped"}">${r.value}</span>`)
                    .join("");
                return `<span class="die-group"><small>${term.expression}:</small> ${faces}</span>`;
            })
            .join(" ");

        const levelText = bd.successLevel ? game.i18n.localize(`ROE.SuccessLevels.${bd.successLevel}`) : "";
        const thresholdHtml = bd.targetValue > 0
            ? `<div class="inspect-thresholds">
           <span>${game.i18n.localize("ROE.Difficulty.Regular")}: <strong>${bd.targetValue}</strong></span>
           <span>${game.i18n.localize("ROE.Difficulty.Hard")}: <strong>${bd.hardThreshold}</strong></span>
           <span>${game.i18n.localize("ROE.Difficulty.Extreme")}: <strong>${bd.extremeThreshold}</strong></span>
         </div>`
            : "";

        const box = document.createElement("div");
        box.className = "roll-inspect-box";
        box.innerHTML = `
      <div class="inspect-header">
        <span><i class="fa-solid fa-dice-d20"></i> ${bd.formula}</span>
        <strong>${bd.total}${bd.targetValue > 0 ? ` / ${bd.targetValue}` : ""}${levelText ? ` (${levelText})` : ""}</strong>
      </div>
      <div class="inspect-dice">${diceHtml}</div>
      ${thresholdHtml}
    `;

        const visuals = this.#buildDiceVisuals(participant);
        if (visuals) box.querySelector(".inspect-dice")?.before(visuals);
        container.appendChild(box);
    }

    static #buildDiceVisuals(participant) {
        const adapter = AdapterRegistry.active;
        const bd = participant.rollBreakdown;
        if (!adapter) return null;

        const isPercentile = Number.isFinite(bd.modifierDice) || (Number(bd.targetValue) > 0 && participant.key !== "damage");
        const dice = isPercentile
            ? adapter.getDiceVisuals({ rollType: "skill" }, bd.modifierDice ?? participant.modifierDice ?? 0)
            : adapter.getDiceVisuals({ rollType: "other", diceFormula: bd.formula }, 0);

        if (!dice?.length) return null;

        const visuals = document.createElement("div");
        visuals.className = "prompt-dice-visuals";
        for (const die of dice) {
            const wrapper = document.createElement("span");
            wrapper.className = "prompt-die";
            wrapper.title = game.i18n.localize(die.label);
            const image = document.createElement("img");
            image.src = die.src;
            image.alt = wrapper.title;
            wrapper.appendChild(image);
            visuals.appendChild(wrapper);
        }
        return visuals;
    }
}
