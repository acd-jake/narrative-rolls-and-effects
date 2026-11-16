import { MODULE_ID } from "../../core/constants.mjs";

export class CoC7ResultFormatter {
    static SYMBOL_MAP = Object.freeze({
        critical: "***!",
        extreme: "***",
        hard: "**",
        regular: "*",
        failure: "-",
        fumble: "---"
    });

    static formatSuccessLevel(successLevel) {
        if (!successLevel) return "";
        const format = game.settings?.get(MODULE_ID, "successLevelFormat") || "text";
        if (format === "symbols") return this.SYMBOL_MAP[successLevel] ?? "";
        return game.i18n.localize(`ROE.SuccessLevels.${successLevel}`);
    }

    static formatRollOutcome({ total, targetValue, successLevel, allowNumbers = true }) {
        const mode = game.settings?.get(MODULE_ID, "resultDisplayMode") || "both";
        const levelText = this.formatSuccessLevel(successLevel);
        if (!allowNumbers || mode === "level") return levelText || String(total ?? "");
        const numberPart = targetValue ? `${total} vs. ${targetValue}` : `${total}`;
        if (mode === "numbers" || !levelText) return numberPart;
        return `${numberPart} • ${levelText}`;
    }
}
