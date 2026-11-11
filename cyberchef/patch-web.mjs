/** @license MIT @copyright 2026 3mg */
import {readFileSync, writeFileSync, copyFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const source = fileURLToPath(new URL("./", import.meta.url));
const marker = "// Homelab Google Authenticator input integration v3";

export function applyWebPatch(target) {
    const changes = [];
    function patch(relative, edits) {
        const path = join(target, relative);
        let text = readFileSync(path, "utf8");
        if (text.includes(marker)) return;
        if (text.includes("// Homelab Google Authenticator input integration")) {
            throw Error(`Restore the pinned upstream source before upgrading the web patch: ${relative}`);
        }
        for (const [before, after] of edits) {
            if (text.split(before).length !== 2) throw Error(`Unexpected CyberChef source anchor: ${relative}`);
            text = text.replace(before, after);
        }
        changes.push([path, text]);
    }

    patch("src/web/waiters/WorkerWaiter.mjs", [
        ['import ChefWorker from ', `${marker}\nimport {googleAuthenticatorRecipe} from "../utils/GoogleAuthenticatorBatch.mjs";\nimport ChefWorker from `],
        ['    async bakeInputs(inputData) {', `    async bakeInputs(inputData) {\n        const googleRecipe = googleAuthenticatorRecipe(this.app.getRecipeConfig());\n        if (googleRecipe) return this.bakeGoogleAuthenticatorInputs(inputData, googleRecipe);`],
        ['    queueInput(inputData) {', '    queueInput(inputData) {\n        if (this.queueGoogleAuthenticatorInput(inputData)) return;'],
        ['                this.app.progress = r.data.progress;\n\n                if (r.data.progress', '                this.mirrorGoogleAuthenticatorOutput(r.data);\n                this.app.progress = r.data.progress;\n\n                if (r.data.progress'],
        ['            case "bakeError":\n                this.app.handleError', '            case "bakeError":\n                this.mirrorGoogleAuthenticatorOutput(r.data);\n                this.app.handleError'],
        ['    cancelBake(silent=false, killAll=false) {', '    cancelBake(silent=false, killAll=false) {\n        this.googleAuthenticatorInputNums = null;'],
        ['        document.getElementById("bake").style.background = "";', `        document.getElementById("bake").style.background = "";\n        if (this.googleAuthenticatorInputNums?.length > 1) {\n            const info = document.getElementById("bake-info");\n            info.textContent = "Combined " + this.googleAuthenticatorInputNums.length + " inputs";\n            info.style.display = "";\n        }`],
        ['    silentBake(recipeConfig) {', readFileSync(join(source, "web/WorkerMethods.txt"), "utf8") + '    silentBake(recipeConfig) {']
    ]);

    patch("src/web/workers/InputWorker.mjs", [
        ['import Utils from ', `${marker}\nimport {collectGoogleAuthenticatorInputs} from "../utils/GoogleAuthenticatorBatch.mjs";\nimport Utils from `],
        ['        case "bakeNext":', '        case "bakeGoogleAuthenticatorInputs":\n            self.bakeGoogleAuthenticatorInputs(r.data);\n            break;\n        case "bakeNext":'],
        ['    delete self.inputs[inputNum];', '    delete self.inputs[inputNum];\n    self.postMessage({action: "googleAuthenticatorInputChanged"});'],
        ['        self.updateInputStatus(r.inputNum, "error");', '        self.updateInputStatus(r.inputNum, "error");\n        self.postMessage({action: "googleAuthenticatorInputChanged"});'],
        ['self.bakeInput = function(inputNum, bakeId) {', `self.bakeGoogleAuthenticatorInputs = function(request) {
    let batch;
    try {
        batch = collectGoogleAuthenticatorInputs(self.inputs);
    } catch (error) {
        batch = {nums: Object.keys(self.inputs).map(Number), error: error.message};
    }
    const inputNum = batch.nums.includes(request.inputNum) ? request.inputNum : batch.nums[0];
    self.postMessage({action: "queueInput", data: {
        ...batch, inputNum, bakeId: request.bakeId, googleAuthenticatorBatch: true
    }});
};

self.bakeInput = function(inputNum, bakeId) {`]
    ]);

    patch("src/web/waiters/InputWaiter.mjs", [
        ['import LoaderWorker from ', `${marker}\nimport {googleAuthenticatorRecipe} from "../utils/GoogleAuthenticatorBatch.mjs";\nimport LoaderWorker from `],
        ['    fileLoaded(inputNum) {', `    fileLoaded(inputNum) {\n        const googleInputs = googleAuthenticatorRecipe(this.app.getRecipeConfig()) !== null;\n        // A loaded file is already in InputWorker. Do not rely on a deferred\n        // editor change event: silent population can race with that event.\n        if (googleInputs) this.app.autoBake();`],
        ['                inputNum: inputNum,\n                silent: false', '                inputNum: inputNum,\n                silent: googleInputs'],
        ['            case "fileLoaded":', '            case "googleAuthenticatorInputChanged":\n                if (googleAuthenticatorRecipe(this.app.getRecipeConfig())) this.app.autoBake();\n                break;\n            case "fileLoaded":']
    ]);

    patch("src/web/waiters/ControlsWaiter.mjs", [
        ['import Utils from ', `${marker}\nimport {hasGoogleAuthenticatorOperation} from "../utils/GoogleAuthenticatorBatch.mjs";\nimport Utils from `],
        ['    generateStateUrl(includeRecipe, includeInput, input, recipeConfig, baseURL) {\n        recipeConfig = recipeConfig || this.app.getRecipeConfig();', '    generateStateUrl(includeRecipe, includeInput, input, recipeConfig, baseURL) {\n        recipeConfig = recipeConfig || this.app.getRecipeConfig();\n        if (hasGoogleAuthenticatorOperation(recipeConfig)) includeInput = false;']
    ]);

    // Validate every pinned-source anchor before writing any upstream file.
    for (const [path, text] of changes) writeFileSync(path, text);
    copyFileSync(join(source, "web/GoogleAuthenticatorBatch.mjs"), join(target, "src/web/utils/GoogleAuthenticatorBatch.mjs"));
}
