"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlaintext = exports.createEqlPayload = exports.eql = void 0;
const logtape_1 = require("@logtape/logtape");
__exportStar(require("./cs_plaintext_v1"), exports);
const eql_1 = require("./eql");
const logger = (0, logtape_1.getLogger)(['jseql']);
const eql = ({ workspaceId, clientId, clientKey, }) => {
    const client = new eql_1.EqlClient({
        workspaceId,
        clientId,
        clientKey,
    });
    return client.init();
};
exports.eql = eql;
const createEqlPayload = ({ plaintext, table, column, schemaVersion = 1, queryType = null, }) => {
    const payload = {
        v: schemaVersion,
        k: 'pt',
        p: plaintext !== null && plaintext !== void 0 ? plaintext : '',
        i: {
            t: table,
            c: column,
        },
    };
    if (queryType) {
        payload.q = queryType;
    }
    logger.debug('Creating the EQL payload', payload);
    return payload;
};
exports.createEqlPayload = createEqlPayload;
const getPlaintext = (payload) => {
    if ((payload === null || payload === void 0 ? void 0 : payload.p) && (payload === null || payload === void 0 ? void 0 : payload.k) === 'pt') {
        logger.debug('Returning the plaintext data from the EQL payload', payload);
        return {
            failure: false,
            plaintext: payload.p,
        };
    }
    logger.error('No plaintext data found in the EQL payload', payload !== null && payload !== void 0 ? payload : {});
    return {
        failure: true,
        error: new Error('No plaintext data found in the EQL payload'),
    };
};
exports.getPlaintext = getPlaintext;
