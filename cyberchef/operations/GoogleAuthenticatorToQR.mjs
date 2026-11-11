/** @license MIT @copyright 2026 3mg */
import GenerateQRCode from "./GenerateQRCode.mjs";
import Operation from "../Operation.mjs";
import qrImage from "qr-image";
import OperationError from "../errors/OperationError.mjs";
import {migrationAccounts} from "./GoogleAuthenticatorToOtpauth.mjs";

class GoogleAuthenticatorToQR extends Operation {
    constructor() {
        super();
        this.name = "Google Authenticator to QR";
        this.module = "GoogleAuthenticator";
        this.inputType = "ArrayBuffer";
        this.outputType = "ArrayBuffer";
        this.presentType = "html";
        this.description = "Opens PNG/JPEG QR images directly or accepts otpauth:// and otpauth-migration:// text, then renders a clean standard QR for the selected account. Account number starts at 1. With this operation first in the recipe, all Input tabs are combined automatically so multi-QR exports work together. No Parse QR Code step is needed. All processing stays in this browser. Input is excluded from state/share links while this operation is enabled. Original OTP algorithms, digits, periods and counters are preserved; Apple Passwords may not support every variant.";
        this.infoURL = "https://github.com/3mg/cyberchef-recipes";
        this.args = [{name: "Account number (starts at 1)", type: "number", value: 1, min: 1}, ...new GenerateQRCode().args];
    }

    async run(input, args) {
        const accounts = await migrationAccounts(input);
        const index = args[0];
        if (!Number.isInteger(index) || index < 1 || index > accounts.length) {
            throw new OperationError(`Account number must be from 1 to ${accounts.length}`);
        }
        if (args[1] === "PNG") {
            // Preserve the Buffer view, not the whole pooled backing ArrayBuffer.
            // This also makes the Node and browser builds return identical PNG bytes.
            try {
                const image = qrImage.imageSync(accounts[index - 1].url, {
                    type: "png", size: args[2], margin: args[3], ec_level: args[4].charAt(0).toUpperCase()
                });
                return image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength);
            } catch (error) {
                throw new OperationError("Could not generate the QR code");
            }
        }
        return new GenerateQRCode().run(accounts[index - 1].url, args.slice(1));
    }

    present(data, args) {
        return new GenerateQRCode().present(data, args.slice(1));
    }
}

export default GoogleAuthenticatorToQR;
