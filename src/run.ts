import {exec} from "@actions/exec";
import * as core from "@actions/core";
import {env} from "process";
import path from "path";
import {readdirSync, statSync} from "fs";
import {mkdirSync, rmSync, writeFileSync} from "fs";
import {spawnSync} from "child_process";
import {chdir, cwd, platform} from "process";

interface Annotation {
    file?: string;
    line?: number;
    text: string;
}

function parseAnalyzerOutput(input: string): Annotation[] {
    const lines = input.split("\n");

    const annotations: Annotation[] = [];
    for (const line of lines) {
        const split = line.split(":");
        if (line.startsWith("-: ")) {
            // Example: -: Client missing method for POST /api/submit
            annotations.push({
                text: split.slice(1).join(":"),
            });
        } else if (split.length === 2) {
            // Example: japecheck: no Client definition found
            annotations.push({
                text: split[1],
            });
        } else if (split.length >= 4) {
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

export async function runTests() {
    const failOnError = core.getBooleanInput("failOnError", {required: false});
    const analyzers = core.getMultilineInput("analyzers", {required: true});
    const flags = core.getMultilineInput("flags", {required: false});
    const directories_lines = core.getMultilineInput("directories", {
        required: true,
    });

    const directories: string[][] = [];
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

    const source = cwd();

    const dir = path.join(source, ".temp");
    try {
        rmSync(dir, {recursive: true, force: true});
    } catch {}
    mkdirSync(dir);
    writeFileSync(path.join(dir, "check.go"), program);

    chdir(dir);

    const packages = ["golang.org/x/tools/go/analysis/multichecker"];
    for (const analyzer of analyzers) {
        const at = analyzer.lastIndexOf("@");
        const noVersion = analyzer.substring(0, at);
        packages.push(
            noVersion.substring(0, noVersion.lastIndexOf(".")) +
                analyzer.slice(at)
        );
    }
    await exec("gofmt", ["-s", "-w", "."]);
    await exec("go", ["mod", "init", "temp"]);
    await exec("go", ["get", ...packages]);
    await exec("go", ["mod", "tidy"]);
    await exec("go", ["build", "-o", "check.exe"]);

    chdir(source);

    let gotError = false;
    core.startGroup(`Analyzer output`);
    for (const dirs of directories) {
        let output: string = "";
        const options = {
            ignoreReturnCode: true,
            listeners: {
                stdout: (data: Buffer) => {
                    output += data.toString();
                },
                stderr: (data: Buffer) => {
                    output += data.toString();
                },
            },
        };

        let slash = "/";
        if (platform === "win32") {
            slash = "\\";
        }

        const args: string[] = [];
        for (const flag of flags) {
            args.push(flag);
        }
        for (const dir of dirs) {
            args.push("." + slash + path.relative(".", dir));
        }
        await exec(path.join(dir, "check.exe"), args, options);
        const annotations: Annotation[] = parseAnalyzerOutput(
            output.toString()
        );
        if (output.toString().includes("panic: ")) {
            gotError = true;
            core.error(`Analyzer panic in ${dirs}`, {
                title: `Analyzer panic in ${dirs}`,
            });
            continue;
        }
        for (const annotation of annotations) {
            gotError = true;

            const result: core.AnnotationProperties = {
                title: `Analyzer warning in ${dirs}`,
            };
            if (annotation.file !== undefined) {
                result.file = path.relative(".", annotation.file);
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

    rmSync(dir, {recursive: true, force: true});
}
