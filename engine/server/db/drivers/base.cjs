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

    // Exact-id lookup (unlike find, no filter syntax / placeholder handling applies to the id).
    // This generic fallback goes through find(), which ignores filter values containing "{...}" and then returns an
    // unfiltered page, so such ids may be missed here: drivers should override it with a real by-id query (as SQLite does).
    async exists(entity, id) {
        return (await this.find(entity, { id: String(id) })).some(r => String(r.id) === String(id));
    }

    async remove(entity, filters = {}) {
        throw new Error('Method not implemented: remove');
    }

    // Number of records matching the filters before _limit / _offset (Issue #54).
    // Generic fallback: drivers should override it with a real count query (as SQLite does).
    async count(entity, filters = {}) {
        const { _limit, _offset, ...rest } = filters;
        return (await this.find(entity, rest)).length;
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
