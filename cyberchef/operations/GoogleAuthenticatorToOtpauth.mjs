/** @license MIT @copyright 2026 3mg */
import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";
import {decodeAll, LIMIT} from "../lib/GoogleAuthenticatorMigration.mjs";

export function migrationAccounts(input) {
    try {
        if (typeof input !== "string" || input.length > LIMIT) {
            throw Error("Export must be text, at most 512 KiB");
        }
        return decodeAll(input.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
    } catch (error) {
        throw new OperationError(error.message);
    }
}

class GoogleAuthenticatorToOtpauth extends Operation {
    constructor() {
        super();
        this.name = "Google Authenticator to otpauth";
        this.module = "GoogleAuthenticator";
        this.description = "Converts Google Authenticator migration exports into standard otpauth:// URLs, one account per line. Paste all otpauth-migration:// URLs from an export, one per line. For a screenshot, put Parse QR Code before this operation. Processing is local. Before entering real secrets, disable Options → Update the URL. Incomplete multi-QR exports and unknown OTP parameters are rejected.";
        this.infoURL = "https://github.com/3mg/cyberchef-recipes";
        this.inputType = "string";
        this.outputType = "string";
        this.args = [];
    }

    run(input) {
        return migrationAccounts(input).map(account => account.url).join("\n");
    }
}

export default GoogleAuthenticatorToOtpauth;
