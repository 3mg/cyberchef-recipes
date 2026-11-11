/** @license MIT @copyright 2026 3mg */
const names = new Set(["Google Authenticator to otpauth", "Google Authenticator to QR"]);
const MAX_INPUTS = 500;
const MAX_FILE = 16 * 1024 * 1024;
const MAX_ENVELOPE = 32 * 1024 * 1024;

export function hasGoogleAuthenticatorOperation(recipe) {
    return recipe.some(operation => !operation.disabled && names.has(operation.op));
}

/** Only the direct conversion recipe gets collective-input semantics. */
export function googleAuthenticatorRecipe(recipe) {
    const enabled = recipe.map((operation, index) => ({operation, index}))
        .filter(({operation}) => !operation.disabled && operation.op !== "Comment");
    if (!enabled.length) return null;
    if (names.has(enabled[0].operation.op)) return recipe.map(operation => ({...operation}));
    if (enabled[0].operation.op === "Parse QR Code" && names.has(enabled[1]?.operation.op)) {
        // Keep indices/breakpoints stable; conversion now reads each original image.
        return recipe.map((operation, index) => ({...operation,
            ...(index === enabled[0].index ? {disabled: true} : {})}));
    }
    return null;
}

function base64(bytes) {
    let binary = "";
    for (let start = 0; start < bytes.length; start += 8192) {
        binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    }
    return btoa(binary);
}

/** Called only inside InputWorker: never modifies, transfers, or persists input. */
export function collectGoogleAuthenticatorInputs(inputs) {
    const entries = Object.entries(inputs).filter(([, input]) => input)
        .sort(([left], [right]) => Number(left) - Number(right));
    const nums = entries.map(([number]) => Number(number));
    const emptyNums = entries.filter(([, input]) => input.type === "userinput" && input.status === "loaded" &&
        (typeof input.buffer === "string" ? input.buffer.length === 0 : input.buffer?.byteLength === 0))
        .map(([number]) => Number(number));
    if (entries.length > MAX_INPUTS) throw Error("Maximum 500 input tabs per conversion.");
    if (entries.some(([, input]) => input.status === "error")) {
        throw Error("An input file could not be loaded. Remove it or load it again.");
    }
    if (entries.some(([, input]) => input.status !== "loaded")) return {nums, allNums: nums, emptyNums, waiting: true};

    const values = [];
    const included = [];
    let estimatedLength = 128;
    for (const [number, input] of entries) {
        const value = input.buffer;
        let bytes;
        if (typeof value === "string") bytes = new TextEncoder().encode(value);
        else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
        else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        else throw Error("An input could not be read. Load the file again.");
        // CyberChef keeps an initial blank editor when files are opened.
        if (!bytes.length && input.type === "userinput") continue;
        if (bytes.length > MAX_FILE) throw Error("Each input must be at most 16 MiB.");
        estimatedLength += 4 * Math.ceil(bytes.length / 3) + 64;
        if (estimatedLength > MAX_ENVELOPE) throw Error("Combined inputs exceed 32 MiB. Use smaller screenshots.");
        values.push({encoding: "base64", data: base64(bytes)});
        included.push(Number(number));
    }
    const input = JSON.stringify({type: "cyberchef-google-authenticator-inputs-v1", inputs: values});
    if (input.length > MAX_ENVELOPE) throw Error("Combined inputs exceed 32 MiB. Use smaller screenshots.");
    return {nums: included, allNums: nums, emptyNums, input};
}
