import { Command } from 'commander';
import * as colors from 'jsr:@std/fmt/colors';
import { Spinner } from 'jsr:@std/cli/unstable-spinner';

import * as yaml from 'jsr:@std/yaml';
import { walk } from 'jsr:@std/fs/walk';
import * as Diff from 'diff';

import type * as CSL from './csl.ts';

import { Bibliographer, UnregisteredItemError } from './bibliographer.ts';
import { validateTestSpecification, parseInput, type TestSpecification } from './specification.ts';
import metadata from '../deno.json' with { type: 'json' };

function diffWithColors(expected: string, actual: string) {
    const difference = Diff.diffChars(expected, actual);
    let coloredExpected = '';
    let coloredActual = '';
    for (const part of difference) {
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

interface ErrorFailure {
    type: 'error';
    error: string;
}
interface CitationFailure {
    type: 'citation';
    actual: string;
    expected: string;
}
interface BibliographyFailure {
    type: 'bibliography';
    actual: string;
    expected: string;
}
type Failure = ErrorFailure | CitationFailure | BibliographyFailure;

interface TestResults {
    citations: [passed: number, failed: number];
    bibliography: [passed: number, failed: number];
}

type TestResultSummary = [boolean, TestResults, Failure[]];

export function test(specification: TestSpecification, items: CSL.Data[]): TestResultSummary {
    // if `tests` is not specified, assume that there is only one global test
    const tests = specification.tests ?? [specification];

    let passed = false;
    const counts: TestResults = { citations: [0, 0], bibliography: [0, 0] };
    const failures: Failure[] = [];
    for (const testCase of tests) {
        // if the test case does not specify the input, use the global definition
        const rawInputs = testCase.input ?? specification.input;
        if (rawInputs === undefined) {
            failures.push({
                type: 'error',
                error: 'Please specify `input`, the list of references to be formatted.'
            });
            continue;
        }
        const inputs = parseInput(rawInputs);
        const bibliographer = new Bibliographer();
        // if the test case does not specify the style, use the globally defined style
        const style = testCase.style ?? specification.style;
        const lang = testCase.lang ?? specification.lang;
        if (style === undefined) {
            failures.push({type: 'error', error: 'Please specify the path of the CSL style to test.'});
            continue;
        }
        try {
            bibliographer.loadStyle(style, lang);
        } catch (err) {
            if (err instanceof Error && err.name == 'NotFound') {
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

        const expectedCitations = testCase.citations;
        const expectedBiblio = testCase.bibliography;

        if (expectedCitations === undefined && expectedBiblio === undefined) {
            failures.push({
                type: 'error',
                error:
                'Please specify expected output (citations and/or bibliography) in your test(s).'
            });
            continue;
        }

        for (const input of inputs) {
            try {
                bibliographer.cite(input);
            } catch(err) {
                if (err instanceof UnregisteredItemError) {
                    failures.push({
                        type: 'error',
                        error: `No reference ${err.erroneousIdentifier} could be found in references.json.`
                    });
                } else {
                    throw err;
                }
            }
        }
        if (expectedCitations) {
            const outputCitations = bibliographer.getCitations();
            const unmatchedCitations = [];
            for (const [i, outputCitation] of outputCitations.entries()) {
                const expected = expectedCitations[i];
                if (expected === undefined) {
                    unmatchedCitations.push(outputCitation);
                } else if (outputCitation == expected) {
                    counts.citations[0]++;
                } else {
                    failures.push({type: 'citation', expected: expected, actual: outputCitation});
                    counts.citations[1]++;
                }
            }
            if (unmatchedCitations.length) {
                failures.push({
                    type: 'error',
                    error: `Please specify all expected outputs in your test for style ${style}.\n` +
                        `The style generated ${outputCitations.length} citations, the test only specified ${expectedCitations.length}.\n` +
                        'The additional citations were:\n' + unmatchedCitations.map((s) => `  - ${s}`).join('\n')
                });
            }
        }
        if (expectedBiblio) {
            const outputBibliography = bibliographer.getBibliography();
            if (expectedBiblio.length !== outputBibliography.length ||
                !(outputBibliography.every((val, i) => val === expectedBiblio[i]))) {
                counts.bibliography[1]++;
                const expectedStr = expectedBiblio.map((s) => `- ${s}`).join('\n');
                const outputStr = outputBibliography.map((s) => `- ${s}`).join('\n');
                failures.push({type: 'bibliography', expected: expectedStr, actual: outputStr});
            } else {
                counts.bibliography[0]++;
            }
        }
    }
    passed = (failures.length == 0) ? true : false;
    return [passed, counts, failures];
}

async function testCommand(testFile: string, options={bail: false, quiet: false, verbose: false}) {
    let testFiles: string[] = [];
    if (testFile) {
        testFiles = [testFile];
    } else {
        const files = await Array.fromAsync(walk('tests/', { exts: ['.yml'] }));
        testFiles = files.map((f) => f.path);
        testFiles.sort();
    }
    const referenceFile = 'tests/references.json';
    let references: CSL.Data[];
    try {
        references = JSON.parse(await Deno.readTextFile(referenceFile));
    } catch(err) {
        if (err instanceof Error && err.name == 'NotFound') {
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

    const quiet = Boolean(options.quiet);
    const verbose = (!quiet && options.verbose) ? true : false;
    const spinner = new Spinner({ message: 'Running tests…' });

    const passes = [];
    for (const testFile of testFiles) {
        if (!quiet) {
            spinner.start();
        }

        let spec: unknown;
        try {
            spec = yaml.parse(await Deno.readTextFile(testFile), {schema: 'failsafe'});
            if (spec === null || typeof spec != 'object') {
                throw new SyntaxError();
            }
            const [valid, errors] = validateTestSpecification(spec);
            if (!valid) {
                for (const err of errors) {
                    console.error(
                        colors.bold(`Error encountered when loading file ${testFile}: `)
                            + err
                    )
                }
                Deno.exit(3);
            }
        } catch(err) {
            if (err instanceof Error && err.name == 'NotFound') {
                console.error(`No such test file ${testFile}`);
                Deno.exit(3);
            } else if (err instanceof SyntaxError) {
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

        const checkMark = passed ? colors.green('✔') : colors.red('✘');
        if (verbose || (!quiet && failures.length)) {
            spinner.stop();
            console.log(` ${checkMark} ${testFile}`);
        }
        if (verbose) {
            spinner.stop();
            let message = '';
            message += `${counts.citations[0]}/${counts.citations.reduce((a, b) => a+b)} citation checks passed;`;
            message += ` ${counts.bibliography[0]}/${counts.bibliography.reduce((a, b) => a+b)} bibliography checks passed.`;
            console.log(`   ${message}`);
        }

        if (!quiet) {
            for (const fail of failures) {
                if (fail.type == 'error') {
                    console.log(`   - ${colors.brightRed('error')}: ${fail.error.replace(/\n/g, '\n     ')}`);
                } else if (fail.type == 'citation') {
                    const [expected, actual] = diffWithColors(fail.expected, fail.actual);
                    console.log(`   - expected citation:\n     ${expected}`);
                    console.log(`     but output was:\n     ${actual}`);
                } else if (fail.type == 'bibliography') {
                    const [expected, actual] = diffWithColors(fail.expected, fail.actual);
                    console.log('   - expected following bibliography:');
                    console.log(expected.replace(/^- /gm, '      - '));
                    console.log('     but output was:');
                    console.log(actual.replace(/^- /gm, '      - '));
                }
            }
        }
        if (verbose || (!quiet && failures.length)) {
            console.log('');
        }
        if (!passed && options.bail) {
            if (verbose) {
                console.log(colors.red('Stopped after first failed test encountered.'));
            }
            Deno.exit(2);
        }
        passes.push(passed);
    }

    spinner.stop();
    const allPassed = !passes.includes(false);

    if (!quiet) {
        const checkMark = allPassed ? colors.green('✔') : colors.red('✘');
        const numPassed = passes.filter((passed) => passed).length;
        console.log(`${checkMark} Ran ${passes.length} test files, ${numPassed} passed`);
    }

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
        .option('-b, --bail', 'abort after first test failure')
        .option('-q, --quiet', 'suppress all normal output')
        .option('--verbose', 'output status for each file')
        .argument('[test-file]')
        .action(testCommand);

    program.parse();
}
