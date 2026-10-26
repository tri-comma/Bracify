// Error whose message is safe to show to the client (intentional validation failures).
// Anything else is treated as internal and answered with a generic message (Issue #44).
class UserError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserError';
        this.userSafe = true;
    }
}

module.exports = UserError;
