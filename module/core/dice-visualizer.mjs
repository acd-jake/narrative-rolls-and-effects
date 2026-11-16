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
    static getDiceVisuals(session, modifierDice = 0, adapter = AdapterRegistry.active) {
        const dice = session?.rollType === "other"
            ? this.fromFormula(session.diceFormula)
            : this.percentile();
        return adapter?.extendDiceVisuals?.(dice, session, modifierDice) ?? dice;
    }

    static percentile() {
        return [
            { src: `${DICE_ASSET_PATH}/d10-units.svg`, label: "ROE.Dice.D10Units", count: 1, multiple: false },
            { src: `${DICE_ASSET_PATH}/d10-tens.svg`, label: "ROE.Dice.D10Tens", count: 1, multiple: false }
        ];
    }

    static fromFormula(formula) {
        if (!formula || typeof formula !== "string") return [];
        try {
            return new foundry.dice.Roll(formula).dice.flatMap((die) => {
                const count = Number(die.number);
                if (!Number.isFinite(count) || count <= 0) return [];
                if (die.faces === 100) return this.percentile();
                const type = DIE_TYPES[die.faces];
                return type ? [{
                    src: `${DICE_ASSET_PATH}/${type.file}.svg`,
                    label: type.label,
                    count,
                    multiple: count > 1
                }] : [];
            });
        } catch {
            return [];
        }
    }
}
