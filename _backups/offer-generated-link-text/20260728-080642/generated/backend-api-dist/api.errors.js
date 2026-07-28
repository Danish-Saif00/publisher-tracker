function createNativeErrorOptions(cause) {
    return cause === undefined
        ? undefined
        : {
            cause,
        };
}
export class ApiHttpError extends Error {
    code;
    statusCode;
    constructor(code, statusCode, message, options = {}) {
        const normalizedMessage = message.trim();
        super(normalizedMessage.length > 0 ? normalizedMessage : 'The HTTP request is invalid.', createNativeErrorOptions(options.cause));
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'ApiHttpError';
    }
}
//# sourceMappingURL=api.errors.js.map