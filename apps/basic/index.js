"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const jseql_1 = require("@cipherstash/jseql");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!process.env.CS_CLIENT_ID || !process.env.CS_CLIENT_KEY) {
            throw new Error('CS_CLIENT_ID and CS_CLIENT_KEY must be set');
        }
        const eqlClient = yield (0, jseql_1.eql)({
            workspaceId: 'test',
            clientId: process.env.CS_CLIENT_ID,
            clientKey: process.env.CS_CLIENT_KEY,
        });
        const ciphertext = yield eqlClient.encrypt({
            plaintext: 'plaintext',
            column: 'column_name',
            table: 'users',
        });
        const plaintext = yield eqlClient.decrypt(ciphertext);
    });
}
main();
