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
        this.inputType = "string";
        this.outputType = "ArrayBuffer";
        this.presentType = "html";
        this.description = "Converts a Google Authenticator export into a QR for one account. Account number starts at 1; increase it to scan the next account with Apple Passwords. Paste every migration URL from a multi-QR export, one per line. For a screenshot, put Parse QR Code first. All processing is local. Disable Options → Update the URL before entering real secrets. Apple Passwords may not support all HOTP/algorithm variants.";
        this.infoURL = "https://github.com/3mg/cyberchef-recipes";
        this.args = [{name: "Account number (starts at 1)", type: "number", value: 1, min: 1}, ...new GenerateQRCode().args];
    }

    run(input, args) {
        const accounts = migrationAccounts(input);
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
