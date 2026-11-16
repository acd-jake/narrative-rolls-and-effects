export class AdapterRegistry {
    static #adapters = new Map();
    static #activeAdapter = null;

    static register(systemId, adapterInstance) {
        this.#adapters.set(systemId, adapterInstance);
    }

    static activate(systemId) {
        this.#activeAdapter = this.#adapters.get(systemId) ?? null;
        if (this.#activeAdapter) {
            this.#activeAdapter.initialize();
        }
        return this.#activeAdapter;
    }

    static get active() {
        return this.#activeAdapter;
    }
}
