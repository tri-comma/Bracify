/**
 * Base class for Database Adapters
 */
class BaseAdapter {
    constructor(options = {}) {
        this.options = options;
    }

    async init() {
        throw new Error('Method not implemented: init');
    }

    async close() {
        // Optional
    }

    async list() {
        throw new Error('Method not implemented: list');
    }

    async find(entity, filters = {}) {
        throw new Error('Method not implemented: find');
    }

    async save(entity, id, data) {
        throw new Error('Method not implemented: save');
    }

    async remove(entity, filters = {}) {
        throw new Error('Method not implemented: remove');
    }

    // Helper for legacy get/put
    async get(entity) {
        const res = await this.find(entity, { id: '__default__' });
        if (res.length > 0) return res[0];
        const all = await this.find(entity);
        return all.length > 0 ? all[0] : null;
    }

    async put(entity, data) {
        return this.save(entity, '__default__', data);
    }
}

module.exports = BaseAdapter;
