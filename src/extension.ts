'use strict';
import * as vscode from 'vscode';
import fs = require('fs');
import path = require('path');
import * as copypaste from 'copy-paste'

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.generateStep', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Please highlight a feature step.');
            return; // No open text editor
        }

        let line = getLine(editor.document, editor.selection.start.line);
        let lineUsesTable = getLine(editor.document, editor.selection.start.line + 1).startsWith('|');

        var stepType = getStepType(line);
        var argMatch = line.match(/'([^']*)'/g);
        var argCount = argMatch ? argMatch.length : 0;
        argCount += lineUsesTable ? 1 : 0;
        var stepText = line.replace(/^.*? /, '');
        var methodName = stepText.replace(/'([^']*)'/g, 'X').replace(/ /g, '_');
        var stepTextRegex = stepText.replace(/'([^']*)'/g, '\'(.*)\'');

        var argList = [];
        for (let i = 0; i < argCount; i++) {
            argList.push("arg" + i);
        }

        let pasteString = "";
        pasteString += `export const ${methodName} = ${stepType} => { \n`;
        pasteString += `   ${stepType}(/${stepTextRegex}/, (${argList.toString()}) => { \n`;
        pasteString += `   }); \n`;
        pasteString += `}; \n`;

        copypaste.copy(pasteString);

        vscode.window.showInformationMessage(`Step copied to clipboard!`);
    });

    vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        if (!document.fileName.endsWith(".feature"))
            return;

        var stream = createFileSteamForFeature(`${document.fileName}.ts`);
        stream.once('open', function (fd) {
            writeToFileStream("//////////////////////////////////////////", stream);
            writeToFileStream("// Auto Generated Content (Do not edit) //", stream);
            writeToFileStream("//////////////////////////////////////////", stream);
            writeToFileStream("", stream);

            writeTestBoilerPlate(stream, document.uri.path);

            for (let lineNumber = 0; lineNumber < document.lineCount - 1; lineNumber++) {
                let currentLine = getLine(document, lineNumber);
                if (isCommentLine(currentLine)) {
                    continue;
                }

                if (currentLine.startsWith("Scenario")) {
                    let scenarioText = currentLine.substr(currentLine.indexOf(":") + 1).trim();
                    writeToFileStream(`test('${scenarioText}', ({ given, when, then }) => {`, stream);

                    lineNumber = recurseWriteSteps(++lineNumber, document, stream);

                    writeToFileStream(` });`, stream);
                    writeToFileStream("", stream);
                }
            }

            saveGeneratedFeatureToDisk(stream);
        });
    });

    context.subscriptions.push(disposable);
}

function recurseWriteSteps(lineNumber: number, document, stream) {
    var line = getLine(document, lineNumber);

    if (isStepLine(line)) {
        line = generateStepMethodName(line)
        writeToFileStream(`     ${line}`, stream);
        return recurseWriteSteps(++lineNumber, document, stream);
    }
    else if (isTableLine(line) || isCommentLine(line)) {
        return recurseWriteSteps(++lineNumber, document, stream);
    }

    return lineNumber++;
}

function generateStepMethodName(line: string) {
    var stepType = getStepType(line);
    line = line.replace(' ', '.');
    line = line.replace(/'([^']*)'/g, 'X');
    line = line.replace(/ /g, '_');
    line += `(${stepType});`;
    return line;
}

function getStepType(line: string) {
    return line.match(/^.*? /)[0].trim().toLowerCase()
}

function isStepLine(line: string) {
    return line.startsWith("Given ")
        || line.startsWith("When ")
        || line.startsWith("Then ")
}

function isCommentLine(line: string) {
    return line.startsWith("#");
}

function isTableLine(line: string) {
    return line.startsWith("|");
}

function writeTestBoilerPlate(stream, filename) {
    let relativePathToTest = path.relative(filename.replace(/^.*?test/, '/test'), '/test').replace(/\\/g, "/").replace("../", "");
    writeToFileStream("import { defineFeature, loadFeature } from 'jest-cucumber';", stream);

    writeToFileStream(`import { TestHooks } from '${relativePathToTest}/configuration/TestHooks';`, stream);
    writeToFileStream(`import * as Given from '${relativePathToTest}/steps/given-steps';`, stream);
    writeToFileStream(`import * as When from '${relativePathToTest}/steps/when-steps';`, stream);
    writeToFileStream(`import * as Then from '${relativePathToTest}/steps/then-steps';`, stream);
    writeToFileStream("", stream);
    writeToFileStream(`const feature = loadFeature('${filename.replace(/^.*?test/, './test')}');`, stream);
    writeToFileStream("", stream);
    writeToFileStream("defineFeature(feature, test => {", stream);
    writeToFileStream(" beforeEach(() => {", stream);
    writeToFileStream("     TestHooks.BeforeEach();", stream);
    writeToFileStream(" });", stream);
    writeToFileStream("", stream);
    writeToFileStream(" afterEach(async () => {", stream);
    writeToFileStream("     TestHooks.AfterEach();", stream);
    writeToFileStream(" });", stream);
    writeToFileStream("", stream);
    writeToFileStream("", stream);
}

function createFileSteamForFeature(filename) {
    var stream = fs.createWriteStream(filename, { encoding: "utf-8", autoClose: true });
    stream.on("error", function (error: any) {
        vscode.window.showErrorMessage("Could not write to file '" + filename + "'. " + error);
    });
    return stream;
}

function writeToFileStream(text, stream) {
    stream.write(text + "\n");
}

function saveGeneratedFeatureToDisk(stream) {
    writeToFileStream("});", stream);
    stream.end();
}

function getLine(document, lineNumber) {
    return document.lineAt(lineNumber).text.trim();
}

export function deactivate() {
}