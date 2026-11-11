import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {applyWebPatch} from "../patch-web.mjs";
import {collectGoogleAuthenticatorInputs as collect, googleAuthenticatorRecipe as recipe, hasGoogleAuthenticatorOperation as hasOperation} from "./GoogleAuthenticatorBatch.mjs";

const otp = {op: "Google Authenticator to otpauth", args: []};
const qr = {op: "Google Authenticator to QR", args: [1, "PNG", 5, 4, "Medium"]};
const parse = {op: "Parse QR Code", args: [false]};
const input = value => ({type: "file", status: "loaded", buffer: Uint8Array.from(value).buffer});
const empty = {type: "userinput", status: "loaded", buffer: new ArrayBuffer(0)};
const original = [{op: "Comment"}, parse, qr];
const prepared = recipe(original);
assert.equal(prepared.length, original.length);
assert.equal(prepared[1].disabled, true);
assert.equal(original[1].disabled, undefined);
assert.equal(recipe([{...parse, disabled: true}, otp])[0].disabled, true);
assert.equal(recipe([{op: "To Base64"}, otp]), null);
assert.equal(recipe([parse]), null);
assert.equal(recipe([{...otp, disabled: true}]), null);
assert.equal(hasOperation([parse, otp]), true);
assert.equal(hasOperation([{...otp, disabled: true}]), false);

const entries = {1: empty, 7: input([255, 0, 128]), 3: input([1, 2, 3])};
const group = collect(entries);
assert.deepEqual(group.nums, [3, 7]);
assert.deepEqual(group.emptyNums, [1]);
assert.deepEqual(group.allNums, [1, 3, 7]);
const packed = JSON.parse(group.input);
assert.equal(packed.type, "cyberchef-google-authenticator-inputs-v1");
assert.deepEqual(packed.inputs.map(item => [...Buffer.from(item.data, "base64")]), [[1, 2, 3], [255, 0, 128]]);
assert.equal(entries[7].buffer.byteLength, 3, "packing must not detach the original file");
assert.deepEqual(collect({...entries, 9: {...input([]), status: "loading"}}), {nums: [1, 3, 7, 9], allNums: [1, 3, 7, 9], emptyNums: [1], waiting: true});
assert.deepEqual(collect({1: empty}).nums, []);
assert.throws(() => collect({1: {...input([]), status: "error"}}), /could not be loaded/);
assert.throws(() => collect({1: {...input([]), buffer: new ArrayBuffer(16 * 1024 * 1024 + 1)}}), /16 MiB/);
assert.throws(() => collect({1: {...input([]), buffer: new ArrayBuffer(16 * 1024 * 1024)}, 2: {...input([]), buffer: new ArrayBuffer(16 * 1024 * 1024)}}), /32 MiB/);
assert.throws(() => collect(Object.fromEntries(Array.from({length: 501}, (_, index) => [index + 1, empty]))), /500/);
assert.deepEqual(collect({3: input([4])}).nums, [3], "removed tabs must not remain in the next snapshot");

// Optional pinned-source integration checks: exercise the actual patched methods
// with fake UI/worker transports; no browser state, credentials or network access.
if (process.argv[2]) {
    const upstream = resolve(process.argv[2]);
    const target = mkdtempSync(join(tmpdir(), "cyberchef-batch-test-"));
    try {
        const files = ["waiters/WorkerWaiter.mjs", "waiters/InputWaiter.mjs", "waiters/ControlsWaiter.mjs", "workers/InputWorker.mjs"];
        for (const directory of ["waiters", "workers", "utils"]) mkdirSync(join(target, "src/web", directory), {recursive: true});
        for (const file of files) copyFileSync(join(upstream, "src/web", file), join(target, "src/web", file));
        applyWebPatch(target);
        const once = files.map(file => readFileSync(join(target, "src/web", file), "utf8"));
        applyWebPatch(target);
        assert.deepEqual(files.map(file => readFileSync(join(target, "src/web", file), "utf8")), once);
        async function imported(file) {
            const text = readFileSync(join(target, "src/web", file), "utf8")
                .replace(/^import .*;\n/gm, "");
            const helper = pathToFileURL(join(target, "src/web/utils/GoogleAuthenticatorBatch.mjs"));
            return (await import("data:text/javascript;base64," + Buffer.from(`import {googleAuthenticatorRecipe,hasGoogleAuthenticatorOperation} from '${helper}';\n` + text).toString("base64"))).default;
        }
        const Worker = await imported("waiters/WorkerWaiter.mjs");
        const states = new Map(), messages = [], results = [], cleared = [];
        const worker = Object.create(Worker.prototype);
        worker.app = {baking: false, progress: 9, getRecipeConfig: () => [parse, qr], bake(step) {this.baking = true; worker.bakeId++; worker.step = step;}};
        worker.bakeId = 4;
        worker.manager = {
            tabs: {getActiveTab: () => 7},
            input: {inputWorker: {postMessage: message => messages.push(message)}},
            output: {outputExists: () => true, addOutput: number => cleared.push(number), set() {}, updateOutputMessage() {},
                updateOutputStatus: (state, number) => states.set(number, state),
                updateOutputError: (error, number) => states.set(number, error)}
        };
        worker.cancelBake = function() {this.app.baking = false; this.googleAuthenticatorInputNums = null;};
        worker.setBakingStatus = value => {worker.app.baking = value;};
        worker.updateOutput = (data, number) => results.push(number);
        await worker.bakeInputs({nums: [7], progress: 9, step: false});
        assert.equal(worker.app.progress, 0);
        assert.equal(worker.recipeConfig[0].disabled, true);
        assert.equal(messages[0].action, "bakeGoogleAuthenticatorInputs");
        assert.equal(messages[0].data.inputNum, 7);
        assert.equal(worker.loadingOutputs, 1);
        assert.equal(worker.queueGoogleAuthenticatorInput({googleAuthenticatorBatch: true, bakeId: 4, nums: [3, 7]}), true);
        assert.equal(worker.googleAuthenticatorInputNums, null, "old batch replies must be ignored");
        assert.equal(worker.queueGoogleAuthenticatorInput({googleAuthenticatorBatch: true, bakeId: 5, nums: [3, 7], waiting: true}), true);
        assert.equal(worker.app.baking, false);
        assert.deepEqual([...states.values()], ["pending", "pending"]);
        await worker.bakeInputs({nums: [7], step: false});
        assert.equal(worker.queueGoogleAuthenticatorInput({googleAuthenticatorBatch: true, bakeId: 6, nums: [3, 7]}), false);
        worker.mirrorGoogleAuthenticatorOutput({inputNum: 7, bakeId: 5});
        assert.deepEqual(results, []);
        worker.mirrorGoogleAuthenticatorOutput({inputNum: 7, bakeId: 6});
        assert.deepEqual(results, [3]);
        worker.app.baking = false;
        await worker.bakeInputs({nums: [7], progress: 9, step: true});
        assert.equal(worker.app.progress, 2, "Step must pause after the converter, not before it");
        assert.equal(worker.step, true);
        worker.queueGoogleAuthenticatorInput({googleAuthenticatorBatch: true, bakeId: 7, nums: [3], emptyNums: [7]});
        assert.deepEqual(cleared, [7], "clearing one input must clear its old output");
        assert.deepEqual(worker.googleAuthenticatorInputNums, [3]);
        worker.app.baking = false;
        await worker.bakeInputs({nums: [7], step: false});
        assert.equal(worker.queueGoogleAuthenticatorInput({googleAuthenticatorBatch: true, bakeId: 8, nums: [], emptyNums: [3, 7]}), true);
        assert.equal(worker.app.baking, false, "an all-empty input set must stop without processing an envelope");
        assert.deepEqual(cleared, [7, 3, 7]);

        // Exercise the actual patched fileLoaded method independently of the
        // editor: both the single active image and background files must bake.
        const inputWaiterSource = readFileSync(join(target, "src/web/waiters/InputWaiter.mjs"), "utf8");
        const fileLoadedText = inputWaiterSource.split("    fileLoaded(inputNum) {")[1].split("\n    /**")[0];
        const fileLoaded = Function("googleAuthenticatorRecipe", "return function(inputNum) {" + fileLoadedText)(recipe);
        let automaticBakes = 0, activeInput = 7, currentRecipe = [qr];
        const population = [];
        const inputWaiter = {
            app: {getRecipeConfig: () => currentRecipe, autoBake: () => automaticBakes++},
            manager: {tabs: {updateTabProgress() {}, getActiveTab: () => activeInput}},
            inputWorker: {postMessage: message => population.push(message)}, updateFileProgress() {}
        };
        fileLoaded.call(inputWaiter, 7);
        assert.equal(automaticBakes, 1, "a single active image must automatically convert");
        assert.equal(population[0].data.silent, true, "preview population must not schedule a duplicate bake");
        fileLoaded.call(inputWaiter, 3);
        assert.equal(automaticBakes, 2, "a background file finishing must recompute the full batch");
        assert.equal(population.length, 1);
        currentRecipe = [{op: "To Base64"}];
        fileLoaded.call(inputWaiter, 7);
        assert.equal(automaticBakes, 2, "ordinary recipes retain the original editor-driven Auto Bake path");
        assert.equal(population[1].data.silent, false);

        const Controls = await imported("waiters/ControlsWaiter.mjs");
        globalThis.window = {location: {protocol: "http:", host: "example.test", pathname: "/"}};
        globalThis.Utils = {generatePrettyRecipe: () => "test", escapeHtml: value => value, encodeURIFragment: encodeURIComponent};
        globalThis.eolSeqToCode = {"\n": "LF"};
        const controls = Object.create(Controls.prototype);
        controls.app = {getRecipeConfig: () => [qr], getURIParams: () => ({input: "secret-from-old-url"})};
        controls.manager = {input: {getChrEnc: () => 0, getEOLSeq: () => "\n"}, output: {getChrEnc: () => 0, getEOLSeq: () => "\n"}};
        assert.equal(controls.generateStateUrl(true, true, "secret-input", [qr]).includes("input="), false);
        assert.equal(controls.generateStateUrl(true, true, null, [qr]).includes("input="), false);
        assert.equal(controls.generateStateUrl(true, true, "ordinary", [{op: "To Base64"}]).includes("input=ordinary"), true);
    } finally {
        rmSync(target, {recursive: true, force: true});
    }
}
console.log("Batch integration: recipe scope, stable indices, complete input snapshots, limits, stale replies, collective output and URL privacy passed.");
