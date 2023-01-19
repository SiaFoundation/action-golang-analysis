import { exec } from "@actions/exec";
import * as core from "@actions/core";
import { env } from "process";
import path from "path";
import { readdirSync, statSync } from "fs";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { chdir, cwd, platform } from "process";

interface Annotation {
    file: string;
    line: number;
    text: string;
}

function parseAnalyzerOutput(input: string): Annotation[] {
    const lines = input.split("\n");

    let annotations: Annotation[] = [];
    for (const line of lines) {
        const split = line.split(":");
        if (split.length != 4) {
            continue;
        }
        annotations.push({ file: split[0], line: Number(split[1]), text: split[3] });
    }
    return annotations;
}

const getDirectories = (source: string) =>
    readdirSync(source, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

export async function runTests() {
    const failOnError = core.getBooleanInput("failOnError", { required: false });
    const analyzers = core.getMultilineInput("analyzers", { required: true });
    for (let i = 0; i < analyzers.length; i++) {
        const lastDot = analyzers[i].lastIndexOf(".");
        const lastSlash = analyzers[i].lastIndexOf("/");
        if (lastDot < lastSlash || (lastDot === -1 && lastSlash === -1)) {
            analyzers[i] += ".Analyzer";
        }
    }

    let program = "package main\n";
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

    const source = cwd();

    const dir = path.join(cwd(), "/.temp");
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {}
    mkdirSync(dir);
    writeFileSync(path.join(dir, "/check.go"), program);

    chdir(dir);

    const packages = ["golang.org/x/tools/go/analysis/multichecker"];
    for (const analyzer of analyzers) {
        packages.push(analyzer.substring(0, analyzer.lastIndexOf(".")) + "@HEAD");
    }
    await exec("gofmt", ["-s", "-w", "."]);
    await exec("go", ["mod", "init", "temp"]);
    await exec("go", ["get", ...packages]);
    await exec("go", ["mod", "tidy"]);
    await exec("go", ["build", "-o", "check"]);

    chdir(source);

    let gotError = false;
    core.startGroup(`Analyzer output`);
    const directories = getDirectories(".");
    for (const directory of directories) {
        if (directory.startsWith(".")) {
            continue;
        }

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
        let suffix = "";
        if (platform === "win32") {
            slash = "\\";
            suffix = ".exe";
        }

        await exec(path.join(dir, "check" + suffix), ["." + slash + path.relative(".", directory)], options);
        const annotations: Annotation[] = parseAnalyzerOutput(output.toString());
        for (const annotation of annotations) {
            gotError = true;
            core.error(annotation.text, {
                title: `Analyzer warning in ${directory}`,
                file: path.relative(".", annotation.file),
                startLine: annotation.line,
            });
        }
    }
    core.endGroup();

    if (gotError && failOnError) {
        core.setFailed("Got analyzer warnings");
    }

    rmSync(dir, { recursive: true, force: true });
}
