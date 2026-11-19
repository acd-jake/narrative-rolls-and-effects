import { MODULE_ID } from "./constants.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

const DICE_ASSET_PATH = `modules/${MODULE_ID}/assets/dice`;

const DIE_TYPES = Object.freeze({
    2: { file: "d2", label: "ROE.Dice.Coin" },
    4: { file: "d4", label: "ROE.Dice.D4" },
    6: { file: "d6", label: "ROE.Dice.D6" },
    8: { file: "d8", label: "ROE.Dice.D8" },
    10: { file: "d10-units", label: "ROE.Dice.D10Units" },
    12: { file: "d12", label: "ROE.Dice.D12" },
    20: { file: "d20", label: "ROE.Dice.D20" }
});

export class DiceVisualizer {
    static getDiceVisuals(session, modifierDice = 0) {
        let dice = this.percentile();
        if (session?.rollType === "other") {
            dice = this.fromFormula(session.diceFormula);
        } else if (session?.diceFormula) {
            const formulaDice = this.#parseDiceTerms(session.diceFormula);
            if (formulaDice.length && !formulaDice.some((die) => die.faces === 100)) {
                dice = this.fromDice(formulaDice);
            }
        }
        return AdapterRegistry.active?.extendDiceVisuals?.(dice, session, modifierDice) ?? dice;
    }

    static percentile(count = 1) {
        return [
            { src: `${DICE_ASSET_PATH}/d10-tens.svg`, label: "ROE.Dice.D10Tens", count, multiple: count > 1 },
            { src: `${DICE_ASSET_PATH}/d10-units.svg`, label: "ROE.Dice.D10Units", count, multiple: count > 1 }
        ];
    }

    static fromFormula(formula) {
        if (!formula || typeof formula !== "string") return [];
        return this.fromDice(this.#parseDiceTerms(formula));
    }

    static #parseDiceTerms(formula) {
        const normalized = this.#expandMultiplierFormula(formula);
        try {
            return new foundry.dice.Roll(normalized).dice;
        } catch {
            return [];
        }
    }

    static #expandMultiplierFormula(formula) {
        const match = formula.trim().match(/^(\d+)\s*[×x*]\s*\((.+)\)$/i);
        if (!match) return formula;
        const factor = Math.max(1, Number(match[1]) || 1);
        const inner = match[2];
        return Array.from({ length: factor }, () => `(${inner})`).join(" + ");
    }

    static fromDice(dice) {
        const grouped = new Map();
        for (const die of dice) {
            const count = Number(die.number);
            const faces = Number(die.faces);
            if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(faces)) continue;
            grouped.set(faces, (grouped.get(faces) ?? 0) + count);
        }

        const visuals = [];
        for (const [faces, count] of grouped.entries()) {
            if (faces === 100) {
                visuals.push(...this.percentile(count));
                continue;
            }
            const type = DIE_TYPES[faces];
            if (type) {
                visuals.push({
                    src: `${DICE_ASSET_PATH}/${type.file}.svg`,
                    label: type.label,
                    count,
                    multiple: count > 1
                });
            }
        }
        return visuals;
    }
}
