import { SessionStore } from "./session-store.mjs";
import { RollVisibilityPolicy } from "./visibility-policy.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";
import { DiceVisualizer } from "./dice-visualizer.mjs";
import { MODULE_ID } from "./constants.mjs";

export class SessionCardRenderer {
    static #resolvedRenderTokens = new WeakMap();

    static registerHooks() {
        Hooks.on("renderChatMessageHTML", (message, html) => {
            if (SessionStore.isSessionMessage(message)) {
                this.applyClientFormatting(message, html);
            }
        });
    }

    /** Formats a session chat card for the current viewer and binds available interactions. */
    static applyClientFormatting(message, html) {
        const isGM = Boolean(game.user?.isGM);
        const sys = SessionStore.getSession(message);
        const adapter = AdapterRegistry.active;
        if (!sys) return;
        const card = html.matches?.(".roe-chat-card") ? html : html.querySelector(".roe-chat-card");
        if (card) card.dataset.nreSystem = game.system.id;
        if (card) this.#resolvedRenderTokens.delete(card);
        const partials = sys.isResolved && adapter?.prepareResolvedChatContext
            ? adapter.getResolvedResultPartials?.(sys)
            : null;
        if (card && partials?.body) {
            this.#renderResolvedCard(card, sys, adapter, partials);
            return;
        }

        const participants = sys.participants ?? [];
        const allRolled = participants.length > 0 && participants.every((p) => p.hasRolled);

        const enriched = participants.map((p) => {
            const actor = SessionStore.resolveActor(p);
            const isOwner = Boolean(actor?.isOwner);
            const opts = !isGM && isOwner && p.hasRolled ? adapter?.evaluateParticipantOptions(p, sys, false) : null;
            return { ...p, actor, isOwner, hasPendingAction: Boolean(opts?.hasPendingAction) };
        });

        const hasPendingOwnDecision = !isGM && enriched.some((p) => p.isOwner && p.hasPendingAction);
        const canRevealResults = isGM || Boolean(sys.isResolved) || (allRolled && !hasPendingOwnDecision);

        for (const p of enriched) {
            if (!p.hasRolled) continue;

            const badge = html.querySelector(`[data-participant-key="${p.key}"] .roll-badge`);
            if (!badge) continue;

            const canViewRoll = RollVisibilityPolicy.canViewParticipantRoll(p, sys);
            const showDetails = isGM || p.isOwner || canRevealResults;
            const permissions = { isGM, isOwner: p.isOwner, canRevealResults, canViewRoll, showDetails, actor: p.actor };
            const formattedBadge = adapter?.formatParticipantBadge?.(p, sys, permissions);
            badge.textContent = formattedBadge?.text ?? (canViewRoll && showDetails ? String(p.total ?? "") : game.i18n.localize("ROE.RollSession.HiddenRoll"));
            if (formattedBadge?.className) badge.className = formattedBadge.className;

            if (canViewRoll && showDetails && p.rollBreakdown) {
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
            resultBody.innerHTML = `<div class="pending-badge">${game.i18n.localize("ROE.RollSession.AwaitingResolution")}</div>`;
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

    static #renderResolvedCard(card, session, adapter, partials) {
        const token = {};
        this.#resolvedRenderTokens.set(card, token);
        card.textContent = game.i18n.localize("ROE.RollSession.LoadingResult");
        this.#finishResolvedCard(card, session, adapter, partials, token).catch((error) =>
            this.#handleResolvedRenderError(card, token, error)
        );
    }

    static async #finishResolvedCard(card, session, adapter, partials, token) {
        const context = {
            ...adapter.prepareResolvedChatContext(session),
            resolvedResultHeaderPartial: partials.header ?? null,
            resolvedResultBodyPartial: partials.body
        };
        const content = await foundry.applications.handlebars.renderTemplate(
            `modules/${MODULE_ID}/templates/chat/resolved-session-result.hbs`, context
        );
        if (this.#resolvedRenderTokens.get(card) !== token) return;
        card.innerHTML = content;
        this.#bindResolvedInspection(card, session);
    }

    static #handleResolvedRenderError(card, token, error) {
        console.error(`${MODULE_ID} | Failed to render resolved chat result.`, error);
        if (this.#resolvedRenderTokens.get(card) === token) {
            card.textContent = game.i18n.localize("ROE.RollSession.ResultRenderError");
        }
    }

    static #bindResolvedInspection(card, session) {
        for (const element of card.querySelectorAll("[data-inspect-key]")) {
            const participant = session.participants?.find((entry) => entry.key === element.dataset.inspectKey);
            if (!participant?.hasRolled || !participant.rollBreakdown) continue;
            if (!RollVisibilityPolicy.canViewParticipantRoll(participant, session)) continue;
            element.classList.add("is-inspectable");
            element.title = game.i18n.localize("ROE.Roll.ClickToInspect");
            element.addEventListener("click", (event) => this.#inspectResolvedResult(event, element, participant));
        }
    }

    static #inspectResolvedResult(event, element, participant) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleBreakdownForElement(element, participant);
    }

    static toggleBreakdownForElement(anchor, participant) {
        if (!anchor || !participant?.rollBreakdown) return;

        const rowWrapper = anchor.closest?.(".combined-check-row, .opposed-contestant-row, .resolved-combat-chips");
        const insertionTarget = anchor.matches?.("[data-participant-key]") ? anchor : (rowWrapper ?? anchor);
        const isContainer = insertionTarget.matches?.("[data-participant-key]");
        const searchRoot = isContainer ? insertionTarget : insertionTarget.parentElement;

        const existing = searchRoot?.querySelector(".roll-inspect-box");
        if (existing) {
            existing.remove();
            return;
        }

        const bd = participant.rollBreakdown;
        const levelText = AdapterRegistry.active?.formatSuccessLevel?.(bd.successLevel) ?? "";
        const thresholdHtml = AdapterRegistry.active?.formatInspectionThresholds?.(bd) ?? "";

        const box = document.createElement("div");
        box.className = "roll-inspect-box";
        box.innerHTML = `
      <div class="inspect-header">
        <span><i class="fa-solid fa-dice-d20"></i> ${bd.formula}</span>
        <strong>${bd.total}${bd.targetValue > 0 ? ` / ${bd.targetValue}` : ""}${levelText ? ` (${levelText})` : ""}</strong>
      </div>
      ${thresholdHtml}
    `;

        const visuals = this.#buildDiceVisuals(participant);
        if (visuals) {
            box.querySelector(".inspect-header")?.after(visuals);
        } else {
            const diceHtml = (bd.diceTerms ?? [])
                .map((term) => {
                    const faces = term.results
                        .map((r) => `<span class="die-face ${r.active ? "is-kept" : "is-dropped"}">${r.value}</span>`)
                        .join("");
                    return `<span class="die-group"><small>${term.expression}:</small> ${faces}</span>`;
                })
                .join(" ");
            box.querySelector(".inspect-header")?.insertAdjacentHTML("afterend", `<div class="inspect-dice">${diceHtml}</div>`);
        }

        if (isContainer) {
            insertionTarget.appendChild(box);
        } else {
            insertionTarget.after(box);
        }
    }

    static #buildDiceVisuals(participant) {
        const adapter = AdapterRegistry.active;
        const bd = participant.rollBreakdown;
        if (!adapter) return null;

        const isPercentile = Number(bd.targetValue) > 0 && participant.key !== "damage";
        const session = isPercentile
            ? { rollType: "skill" }
            : { rollType: "other", diceFormula: bd.formula };
        const modifierDice = isPercentile ? bd.modifierDice ?? participant.modifierDice ?? 0 : 0;
        const dice = DiceVisualizer.getDiceVisuals(session, modifierDice);

        if (!dice?.length) return null;

        const rolledEntries = this.#extractRolledIconEntries(bd, isPercentile);
        const expandedDice = dice.flatMap((die) =>
            Array.from({ length: Math.max(1, Number(die.count) || 1) }, () => ({ ...die, count: 1, multiple: false }))
        );

        const visuals = document.createElement("div");
        visuals.className = "prompt-dice-visuals inspect-dice-visuals";

        expandedDice.forEach((die, index) => {
            const rolled = rolledEntries[index] ?? null;
            const wrapper = document.createElement("span");
            wrapper.className = "prompt-die";
            if (rolled) {
                wrapper.classList.add(rolled.active ? "is-kept" : "is-dropped");
            }

            const dieTypeLabel = adapter.formatDiceVisualTooltip
                ? adapter.formatDiceVisualTooltip(die)
                : game.i18n.localize(die.label);
            if (rolled?.displayValue !== undefined) {
                const droppedNote = rolled.active ? "" : ` (${game.i18n.localize("ROE.Dice.Dropped")})`;
                wrapper.dataset.tooltip = `${dieTypeLabel}: ${rolled.displayValue}${droppedNote}`;
            } else {
                wrapper.dataset.tooltip = dieTypeLabel;
            }

            const image = document.createElement("img");
            image.src = die.src;
            image.alt = game.i18n.localize(die.label);
            wrapper.appendChild(image);

            if (rolled?.displayValue !== undefined) {
                const valueBadge = document.createElement("span");
                valueBadge.className = "prompt-die-rolled-value";
                valueBadge.textContent = String(rolled.displayValue);
                wrapper.appendChild(valueBadge);
            }

            visuals.appendChild(wrapper);
        });
        return visuals;
    }

    static #extractRolledIconEntries(bd, isPercentile) {
        const terms = bd.diceTerms ?? [];
        if (isPercentile && terms.length >= 2) {
            const tensResults = terms[0]?.results ?? [];
            const unitsResult = terms[1]?.results?.[0] ?? null;
            const entries = [];
            for (const res of tensResults) {
                const tensDigit = Math.max(0, Number(res.value) - 1) * 10;
                entries.push({
                    displayValue: tensDigit === 0 ? "00" : String(tensDigit),
                    active: res.active !== false
                });
            }
            if (unitsResult) {
                entries.push({ displayValue: Math.max(0, Number(unitsResult.value) - 1), active: unitsResult.active !== false });
            }
            return entries;
        }
        if (isPercentile && terms.length === 1 && terms[0]?.results?.[0]) {
            const total = Number(terms[0].results[0].value) % 100;
            const units = total % 10;
            const tens = Math.floor(total / 10) * 10;
            return [
                { displayValue: tens === 0 ? "00" : String(tens), active: true },
                { displayValue: String(units), active: true }
            ];
        }
        return terms.flatMap((term) =>
            (term.results ?? []).map((r) => ({ displayValue: r.value, active: r.active !== false }))
        );
    }
}
