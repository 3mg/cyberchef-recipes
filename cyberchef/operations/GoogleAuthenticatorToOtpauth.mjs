/** @license MIT @copyright 2026 3mg */
import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";
import {accountsFromInput} from "../lib/GoogleAuthenticatorInput.mjs";

export async function migrationAccounts(input) {
    try {
        return await accountsFromInput(input);
    } catch (error) {
        throw new OperationError(error.message);
    }
}

class GoogleAuthenticatorToOtpauth extends Operation {
    constructor() {
        super();
        this.name = "Google Authenticator to otpauth";
        this.module = "GoogleAuthenticator";
        this.description = "Opens PNG/JPEG QR images directly or accepts otpauth:// and otpauth-migration:// text. Normalises standard account URLs and converts Google Authenticator exports into one URL per account. With this operation first in the recipe, all Input tabs are combined automatically, including every part of a multi-QR export. No Parse QR Code step is needed. Processing stays in this browser. Input is excluded from state/share links while this operation is enabled. Incomplete exports and unsupported OTP parameters are rejected.";
        this.infoURL = "https://github.com/3mg/cyberchef-recipes";
        this.inputType = "ArrayBuffer";
        this.outputType = "string";
        this.args = [];
    }

    async run(input) {
        return (await migrationAccounts(input)).map(account => account.url).join("\n");
    }
}

export default GoogleAuthenticatorToOtpauth;
