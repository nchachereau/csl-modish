import { Command } from 'commander';
import * as colors from 'jsr:@std/fmt/colors';
import * as yaml from 'jsr:@std/yaml';
import { walk } from 'jsr:@std/fs/walk';
import * as Diff from 'diff';

import { Bibliographer } from './bibliographer.js';
import metadata from '../deno.json' with { type: 'json' };

const LOCATORS = {
    'bk.': 'book',
    'bks.': 'book',
    'chap.': 'chapter',
    'chaps.': 'chapter',
    'col.': 'column',
    'cols.': 'column',
    'fig.': 'figure',
    'figs.': 'figure',
    'fol.': 'folio',
    'fols.': 'folio',
    'no.': 'number',
    'Os.': 'number',
    'l.': 'line',
    'll.': 'line',
    'n.': 'note',
    'nn.': 'note',
    'op.': 'opus',
    'opp.': 'opus',
    'p': 'page',
    'p.': 'page',
    'pp.': 'page',
    'para.': 'paragraph',
    'paras.': 'paragraph',
    '¶': 'paragraph',
    '¶¶': 'paragraph',
    '§': 'paragraph',
    '§§': 'paragraph',
    'pt.': 'part',
    'pts.': 'part',
    'sec.': 'section',
    'secs.': 'section',
    's.v.': 'sub verbo',
    's.vv.': 'sub verbo',
    'v.': 'verse',
    'vv.': 'verse',
    'vol.': 'volume',
    'vols.': 'volume',
};

export function parseInput(inputs) {
    let parsedInputs = [];
    for (let rawInput of inputs) {
        let parsedInput = [];
        let items = rawInput.split(';');
        for (let item of items) {
            let parts = item.trim().split(' ').map((part) => part.trim());
            let citationItem = { 'id': parts[0] };
            if (parts.length > 1) {
                if (parts[1] in LOCATORS) {
                    citationItem.label = LOCATORS[parts[1]];
                    citationItem.locator = parts[2];
                } else if (Object.values(LOCATORS).includes(parts[1])) {
                    citationItem.label = parts[1];
                    citationItem.locator = parts[2];
                }
            }
            parsedInput.push(citationItem);
        }
        parsedInputs.push(parsedInput);
    }
    return parsedInputs;
}

function diffWithColors(expected, actual) {
    let difference = Diff.diffChars(expected, actual);
    let coloredExpected = '';
    let coloredActual = '';
    for (let part of difference) {
        if (part.added) {
            coloredActual += colors.bgRed(part.value);
        } else if (part.removed) {
            coloredExpected += colors.bgRed(part.value);
        } else {
            coloredActual += part.value;
            coloredExpected += part.value;
        }
    }
    return [coloredExpected, coloredActual];
}

export function test(specification, items) {
    // if `tests` is not specified, assume that there is only one global test
    let tests = specification.tests ?? [specification];

    let passed = false;
    let counts = { citations: [0, 0], bibliography: [0, 0] };
    let failures = [];
    for (let testCase of tests) {
        // if the test case does not specify the input, use the global definition
        let inputs = parseInput(testCase.input ?? specification.input);
        let bibliographer = new Bibliographer();
        // if the test case does not specify the style, use the globally defined style
        let style = testCase.style ?? specification.style;
        if (style === undefined) {
            failures.push({type: 'error', error: 'Please specify the path of the CSL style to test.'});
            continue;
        }
        try {
            bibliographer.loadStyle(style);
        } catch(err) {
            if (err.code == 'ENOENT') {
                failures.push({
                    type: 'error',
                    error: err.message
                });
                continue;
            } else {
                throw err;
            }
        }
        bibliographer.registerItems(items);

        if (!('citations' in testCase || 'bibliography' in testCase)) {
            failures.push({
                type: 'error',
                error:
                'Please specify expected output (citations and/or bibliography) in your test(s).'
            });
            continue;
        }

        for (let input of inputs) {
            try {
                bibliographer.cite(input);
            } catch(err) {
                if (err.name == 'UnregisteredItemError') {
                    failures.push({
                        type: 'error',
                        error: `No reference ${err.erroneousIdentifier} could be found in references.json.`
                    });
                } else {
                    throw err;
                }
            }
        }
        if ('citations' in testCase) {
            let outputCitations = bibliographer.getCitations();
            let expectedCitations = testCase.citations;
            for (let [i, outputCitation] of outputCitations.entries()) {
                let expected = expectedCitations[i];
                if (outputCitation == expected) {
                    counts.citations[0]++;
                } else {
                    failures.push({type: 'citation', expected: expected, actual: outputCitation});
                    counts.citations[1]++;
                }
            }
        }
        if ('bibliography' in testCase) {
            let outputBibliography = bibliographer.getBibliography();
            let expectedBiblio = testCase.bibliography;
            if (expectedBiblio.length !== outputBibliography.length ||
                !(outputBibliography.every((val, i) => val === expectedBiblio[i]))) {
                counts.bibliography[1]++;
                let expectedStr = expectedBiblio.map((s) => `- ${s}`).join('\n');
                let outputStr = outputBibliography.map((s) => `- ${s}`).join('\n');
                failures.push({type: 'bibliography', expected: expectedStr, actual: outputStr});
            } else {
                counts.bibliography[0]++;
            }
        }
    }
    passed = (failures.length == 0) ? true : false;
    return [passed, counts, failures];
}

async function testCommand(testFile) {
    let testFiles = [];
    if (testFile) {
        testFiles = [testFile];
    } else {
        testFiles = await Array.fromAsync(walk('tests/', { exts: ['.yml'] }));
        testFiles = testFiles.map((f) => f.path);
    }
    const referenceFile = 'tests/references.json';
    let references;
    try {
        references = JSON.parse(await Deno.readTextFile(referenceFile));
    } catch(err) {
        if (err.code == 'ENOENT') {
            console.error(
                `No CSL-JSON reference file '${referenceFile}. Create one, for instance by\n` +
                'exporting it from your reference management software (e.g. Zotero).');
            Deno.exitCode = 3;
            return;
        } else if (err instanceof SyntaxError) {
            console.error(
                `Could not parse CSL-JSON reference file ${referenceFile}. You may need to\n` +
                    '  export one again from your reference management software (e.g. Zotero).\n' +
                    'If you wrote the JSON file yourself, you need to fix the syntax. Parsing error was:\n' +
                    `  '${err.message}'.`
            );
            Deno.exitCode = 3;
            return;
        } else {
            throw err;
        }
    }
    let passes = [];

    for (let testFile of testFiles) {
        let spec;
        try {
            spec = yaml.parse(await Deno.readTextFile(testFile));
        } catch(err) {
            if (err.code == 'ENOENT') {
                console.error(`No such test file ${testFile}`);
                Deno.exit(3);
            } else if (err.name == 'SyntaxError' || err.name == 'YAMLError') {
                console.error(
                    colors.bold(`Error encountered when loading file ${testFile}. Check that the\n` +
                                'contents follow the guidelines for test files.\n\n') +
                        `The error was:\n ${err.message}`
                );
                Deno.exit(3);
            } else {
                throw err;
            }
        }
        const [passed, counts, failures] = test(spec, references);

        let checkMark = passed ? colors.green('✔') : colors.red('✘');
        console.log(` ${checkMark} ${testFile}`);
        let message = '';
        message += `${counts.citations[0]}/${counts.citations.reduce((a, b) => a+b)} citation checks passed;`;
        message += ` ${counts.bibliography[0]}/${counts.bibliography.reduce((a, b) => a+b)} bibliography checks passed.`;
        console.log(`   ${message}`);

        for (let fail of failures) {
            if (fail.type == 'error') {
                console.log(`   - ${colors.brightRed('error')}: ${fail.error}`);
            } else if (fail.type == 'citation') {
                let [expected, actual] = diffWithColors(fail.expected, fail.actual);
                console.log(`   - expected citation: ${expected}`);
                console.log(`     but output was: ${actual}`);
            } else if (fail.type == 'bibliography') {
                let [expected, actual] = diffWithColors(fail.expected, fail.actual);
                console.log('   - expected following bibliography:');
                console.log(expected.replace(/^- /gm, '      - '));
                console.log('     but output was:');
                console.log(actual.replace(/^- /gm, '      - '));
            }
        }
        console.log('');
        passes.push(passed);
    }

    const allPassed = !passes.includes(false);
    let checkMark = allPassed ? colors.green('✔') : colors.red('✘');
    let numPassed = passes.filter((passed) => passed).length;
    console.log(`${checkMark} Ran ${passes.length} test files, ${numPassed} passed`);
    console.log();

    Deno.exitCode = allPassed ? 0 : 2;
}

if (import.meta.main) {
    const program = new Command();
    program
        .name('modish')
        .description(metadata.description)
        .version(metadata.version);

    program
        .command('test')
        .description('Run tests')
        .argument('[test-file]')
        .action(testCommand);

    program.parse();
}
