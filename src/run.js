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
const fs_2 = require("fs");
const process_1 = require("process");
function parseAnalyzerOutput(input) {
    const lines = input.split("\n");
    let annotations = [];
    for (const line of lines) {
        const split = line.split(":");
        if (split.length != 4) {
            continue;
        }
        annotations.push({ file: split[0], line: Number(split[1]), text: split[3] });
    }
    return annotations;
}
const getDirectories = (source) => (0, fs_1.readdirSync)(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
function runTests() {
    return __awaiter(this, void 0, void 0, function* () {
        let program = "package main\n";
        const analyzers = core.getInput("analyzers", { required: false }).split(";");
        program += `import ("golang.org/x/tools/go/analysis/multichecker";`;
        for (const analyzer of analyzers) {
            program += `"` + analyzer.substring(0, analyzer.lastIndexOf(".")) + `";`;
        }
        program += ")\n";
        program += "func main() {multichecker.Main(";
        for (const analyzer of analyzers) {
            program += analyzer.substring(analyzer.lastIndexOf("/") + 1) + ",";
        }
        program += ")}\n";
        const source = (0, process_1.cwd)();
        const dir = (0, process_1.cwd)() + "/.temp";
        try {
            (0, fs_2.rmSync)(dir, { recursive: true, force: true });
        }
        catch (_a) { }
        (0, fs_2.mkdirSync)(dir);
        (0, fs_2.writeFileSync)(dir + "/check.go", program);
        (0, process_1.chdir)(dir);
        const packages = ["golang.org/x/tools/go/analysis/multichecker"];
        for (const analyzer of analyzers) {
            packages.push(analyzer.substring(0, analyzer.lastIndexOf(".")) + "@HEAD");
        }
        yield (0, exec_1.exec)("gofmt", ["-s", "-w", "."]);
        yield (0, exec_1.exec)("go", ["mod", "init", "temp"]);
        yield (0, exec_1.exec)("go", ["get", ...packages]);
        yield (0, exec_1.exec)("go", ["mod", "tidy"]);
        yield (0, exec_1.exec)("go", ["build", "-o", "check"]);
        (0, process_1.chdir)(source);
        core.startGroup(`Analyzer output`);
        const directories = getDirectories(".");
        for (const directory of directories) {
            if (directory.startsWith(".")) {
                continue;
            }
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
            yield (0, exec_1.exec)(dir + "/check", ["./" + path_1.default.relative(".", directory)], options);
            const annotations = parseAnalyzerOutput(output.toString());
            for (const annotation of annotations) {
                core.error(annotation.text, {
                    title: `Analyzer warning in ${directory}`,
                    file: path_1.default.relative(".", annotation.file),
                    startLine: annotation.line,
                });
            }
        }
        core.endGroup();
        (0, fs_2.rmSync)(dir, { recursive: true, force: true });
    });
}
exports.runTests = runTests;
