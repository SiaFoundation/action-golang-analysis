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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = void 0;
const exec_1 = require("@actions/exec");
const core = __importStar(require("@actions/core"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const process_1 = require("process");
function parseAnalyzerOutput(input) {
    const lines = input.split("\n");
    const annotations = [];
    for (const line of lines) {
        const split = line.split(":");
        if (line.startsWith("-: ")) {
            // Example: -: Client missing method for POST /api/submit
            annotations.push({
                text: split.slice(1).join(":"),
            });
        }
        else if (split.length === 2) {
            // Example: japecheck: no Client definition found
            annotations.push({
                text: split[1],
            });
        }
        else if (split.length >= 4) {
            // Most common case - we have file, line number, and text
            // Example: a/b/c/accounts.go:17:66: Client has wrong request type for POST /account/:id (got <nil>, should be go.sia.tech/renterd/api.AccountHandlerPOST)
            annotations.push({
                file: split[0],
                line: Number(split[1]),
                text: split.slice(3).join(":"),
            });
        }
    }
    return annotations;
}
function runTests() {
    return __awaiter(this, void 0, void 0, function* () {
        const failOnError = core.getBooleanInput("failOnError", { required: false });
        const analyzers = core.getMultilineInput("analyzers", { required: true });
        const directories_lines = core.getMultilineInput("directories", {
            required: true,
        });
        const directories = [];
        for (let i = 0; i < directories_lines.length; i++) {
            directories[i] = directories_lines[i].split(" ");
        }
        for (let i = 0; i < analyzers.length; i++) {
            if (!analyzers[i].includes("@")) {
                analyzers[i] += "@HEAD";
            }
        }
        for (let i = 0; i < analyzers.length; i++) {
            const at = analyzers[i].lastIndexOf("@");
            const lastDot = analyzers[i].slice(0, at).lastIndexOf(".");
            const lastSlash = analyzers[i].slice(0, at).lastIndexOf("/");
            if (lastDot < lastSlash || (lastDot === -1 && lastSlash === -1)) {
                analyzers[i] =
                    analyzers[i].slice(0, at) +
                        ".Analyzer" +
                        analyzers[i].slice(at);
            }
        }
        let program = "package main\n";
        program += `import ("golang.org/x/tools/go/analysis/multichecker";`;
        for (let analyzer of analyzers) {
            analyzer = analyzer.substring(0, analyzer.lastIndexOf("@"));
            program +=
                `"` + analyzer.substring(0, analyzer.lastIndexOf(".")) + `";`;
        }
        program += ")\n";
        program += "func main() {multichecker.Main(";
        for (let analyzer of analyzers) {
            analyzer = analyzer.substring(0, analyzer.lastIndexOf("@"));
            program += analyzer.substring(analyzer.lastIndexOf("/") + 1) + ",";
        }
        program += ")}\n";
        const source = (0, process_1.cwd)();
        const dir = path_1.default.join(source, ".temp");
        try {
            (0, fs_1.rmSync)(dir, { recursive: true, force: true });
        }
        catch (_a) { }
        (0, fs_1.mkdirSync)(dir);
        (0, fs_1.writeFileSync)(path_1.default.join(dir, "check.go"), program);
        (0, process_1.chdir)(dir);
        const packages = ["golang.org/x/tools/go/analysis/multichecker"];
        for (const analyzer of analyzers) {
            const at = analyzer.lastIndexOf("@");
            const noVersion = analyzer.substring(0, at);
            packages.push(noVersion.substring(0, noVersion.lastIndexOf(".")) +
                analyzer.slice(at));
        }
        yield (0, exec_1.exec)("gofmt", ["-s", "-w", "."]);
        yield (0, exec_1.exec)("go", ["mod", "init", "temp"]);
        yield (0, exec_1.exec)("go", ["get", ...packages]);
        yield (0, exec_1.exec)("go", ["mod", "tidy"]);
        yield (0, exec_1.exec)("go", ["build", "-o", "check.exe"]);
        (0, process_1.chdir)(source);
        let gotError = false;
        core.startGroup(`Analyzer output`);
        for (const dirs of directories) {
            let output = "";
            const options = {
                ignoreReturnCode: true,
                listeners: {
                    stdout: (data) => {
                        output += data.toString();
                    },
                    stderr: (data) => {
                        output += data.toString();
                    },
                },
            };
            let slash = "/";
            if (process_1.platform === "win32") {
                slash = "\\";
            }
            const args = [];
            for (const dir of dirs) {
                args.push("." + slash + path_1.default.relative(".", dir));
            }
            yield (0, exec_1.exec)(path_1.default.join(dir, "check.exe"), args, options);
            const annotations = parseAnalyzerOutput(output.toString());
            if (output.toString().includes("panic: ")) {
                gotError = true;
                core.error(`Analyzer panic in ${dirs}`, {
                    title: `Analyzer panic in ${dirs}`,
                });
                continue;
            }
            for (const annotation of annotations) {
                gotError = true;
                const result = {
                    title: `Analyzer warning in ${dirs}`,
                };
                if (annotation.file !== undefined) {
                    result.file = path_1.default.relative(".", annotation.file);
                }
                if (annotation.line !== undefined) {
                    result.startLine = annotation.line;
                }
                core.error(annotation.text, result);
            }
        }
        core.endGroup();
        if (gotError && failOnError) {
            core.setFailed("Got analyzer warnings");
        }
        (0, fs_1.rmSync)(dir, { recursive: true, force: true });
    });
}
exports.runTests = runTests;
