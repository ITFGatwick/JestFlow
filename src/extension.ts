'use strict';
import * as vscode from 'vscode';
import fs = require('fs');
import path = require('path');
import * as copypaste from 'copy-paste'
import { generateCodeWithSeparateFunctionsFromFeature, parseFeature } from 'jest-cucumber';
import * as Gherkin from 'gherkin';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.generateStep', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Please highlight a feature step.');
            return; // No open text editor
        }

        let useJestCucumber = vscode.workspace.getConfiguration('jestflow').get("usejestcucumbergeneration");
        let pasteString = "";

        if (useJestCucumber) {
            let document = parseFeature(editor.document.getText());
            pasteString = generateCodeWithSeparateFunctionsFromFeature(document, editor.selection.start.line + 1);
        }
        else {
            var parser = new Gherkin.Parser();
            var gherkinDocument = parser.parse(editor.document.getText());

            var step = getStepForLine(gherkinDocument, editor.selection.start.line + 1);
            let keyword = getKeywordForStep(step, gherkinDocument).toLowerCase();

            var argMatch = step.text.match(/'([^']*)'/g);
            var argCount = argMatch ? argMatch.length : 0;
            var stepTextRegex = step.text.replace(/'([^']*)'/g, '\'(.*)\'');
            var methodName = step.text.replace(/'([^']*)'/g, 'X').replace(/ /g, '_');

            var argList = [];
            for (let i = 0; i < argCount; i++) {
                argList.push("arg" + i);
            }
            if (step.argument) {
                argList.push("table");
            }

            pasteString += `export const ${methodName} = ${keyword} => { \n`;
            pasteString += `   ${keyword}(/${stepTextRegex}/, (${argList.toString()}) => { \n`;
            pasteString += `   }); \n`;
            pasteString += `}; \n`;
        }

        copypaste.copy(pasteString);

        vscode.window.showInformationMessage(`Step copied to clipboard!`);
    });


    vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        let disabled = vscode.workspace.getConfiguration('jestflow').get("usejestcucumbergeneration");
        if (disabled)
            return;

        if (!document.fileName.endsWith(".feature"))
            return;

        var stream = createFileSteamForFeature(`${document.fileName}.ts`);
        stream.once('open', function (fd) {
            writeToFileStream("//////////////////////////////////////////", stream);
            writeToFileStream("// Auto Generated Content (Do not edit) //", stream);
            writeToFileStream("//////////////////////////////////////////", stream);
            writeToFileStream("", stream);

            writeTestBoilerPlate(stream, document.uri.path);

            var parser = new Gherkin.Parser();
            var gherkinDocument = parser.parse(document.getText());

            gherkinDocument.feature.children.forEach(scenario => {
                if (isConjecture(scenario.steps[0])) {
                    throwError("First step in scenario can not be an \'And\' or \'But\'");
                }

                writeToFileStream(`test('${scenario.name}', ({ given, when, then }) => {`, stream);
                scenario.steps.forEach((step) => {
                    let keyword = getKeywordForStep(step, gherkinDocument);
                    let line = generateStepMethodName(`${keyword}${step.text}`, keyword);
                    writeToFileStream(`     ${line}`, stream);
                });
                writeToFileStream(` });`, stream);
                writeToFileStream("", stream);
            });

            saveGeneratedFeatureToDisk(stream);
        });
    });

    context.subscriptions.push(disposable);
}


function getKeywordForStep(step, gherkinDocument): string {
    if (!isConjecture(step))
        return step.keyword.trim();

    let scenarioForStep = gherkinDocument.feature.children.filter((scenario) => scenario.location.line < step.location.line).slice(-1).pop();
    let latestKeyword: string;

    for (let s of scenarioForStep.steps) {
        if (!isConjecture(s))
            latestKeyword = s.keyword.trim();

        if (s.location.line == step.location.line)
            break;
    };

    return latestKeyword;
}

function getStepForLine(gherkinDocument, lineNumber) {
    let scenario = gherkinDocument.feature.children.filter((scenario) => scenario.location.line < lineNumber).slice(-1).pop();
    return scenario.steps.find(step => step.location.line == lineNumber);
}

function isConjecture(step) {
    let keyword = step.keyword.trim();
    return keyword == "And" || keyword == "But";
}

function throwError(message: string) {
    vscode.window.showErrorMessage(message);
    throw new Error(message);
}

function generateStepMethodName(line: string, stepType: string) {
    let regex = new RegExp(stepType);
    line = line.replace(regex, stepType + '.');
    line = line.replace(/'([^']*)'/g, 'X');
    line = line.replace(/ /g, '_');
    line += `(${stepType.toLowerCase()});`;
    return line;
}

function writeTestBoilerPlate(stream, filename) {
    let rootFolder = vscode.workspace.getConfiguration('jestflow').get("stepsfolder");
    let regex = new RegExp("^.*?" + rootFolder);
    let relativePathToTest = path.relative(filename.replace(regex, '/' + rootFolder), '/' + rootFolder)
        .replace(/\\/g, "/").replace("../", "");

    writeToFileStream("import { defineFeature, loadFeature } from 'jest-cucumber';", stream);
    writeToFileStream(`import { TestHooks } from '${relativePathToTest}/configuration/TestHooks';`, stream);
    writeToFileStream(`import * as Given from '${relativePathToTest}/steps/given-steps';`, stream);
    writeToFileStream(`import * as When from '${relativePathToTest}/steps/when-steps';`, stream);
    writeToFileStream(`import * as Then from '${relativePathToTest}/steps/then-steps';`, stream);
    writeToFileStream("", stream);
    writeToFileStream(`const feature = loadFeature('${filename.replace(new RegExp("^.*?" + rootFolder), './' + rootFolder)}');`, stream);
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

export function deactivate() {
}