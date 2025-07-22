import { Command } from 'commander';
import * as colors from 'jsr:@std/fmt/colors';
import { Spinner } from 'jsr:@std/cli/unstable-spinner';

import { walk } from 'jsr:@std/fs/walk';

import type * as CSL from './csl.ts';

import { TestSpecification } from './specification.ts';
import { diffWithColors, expandFileArguments } from './utils.ts';
import metadata from '../deno.json' with { type: 'json' };

//////////
// Define the commands available on the command line

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
        .argument('[test-files...]')
        .action(testingCommand);

    program.parse();
}

//////////
// Functions executed when the commands are called

/** Options for {@linkcode testingCommand} */
export interface TestingCmdOptions {
    /** abort after first failure */
    bail: boolean;
    /** suppress all output */
    quiet: boolean;
    /** output status for each test file */
    verbose: boolean;
}

/**
 * Function called when the user runs `modish test`.
 *
 * @param testFiles List of files containing the tests to be run.
 * @param options Options, passed on the command line
 */
export async function testingCommand(
    testFiles: string[],
    options: TestingCmdOptions={bail: false, quiet: false, verbose: false}
) {
    if (testFiles.length == 0) {
        const files = await Array.fromAsync(walk('tests/', { exts: ['.yml'] }));
        testFiles = files.map((f) => f.path);
        testFiles.sort();
    } else if (Deno.build.os == "windows") {
        testFiles = await expandFileArguments(testFiles);
    }

    let referenceFiles = await Array.fromAsync(walk('tests/', { exts: ['.json'] }));
    referenceFiles = referenceFiles.map((f) => f.path);
    if (referenceFiles.length == 0) {
        console.error(
            "No CSL-JSON file was found in the `tests` directory. Modish needs at least one\n" +
                "such file containing the bibliographic entries for the tests. Create a \n" +
                "CSL-JSON reference file, for instance by exporting it from your reference\n" +
                "software (e.g. Zotero)."
        )
        Deno.exitCode = 3;
        return;
    }
    let references: CSL.Data[];
    try {
        references = loadCSLReferenceFiles(referenceFiles);
    } catch (err) {
        Deno.exitCode = 3;
        return;
    }

    const quiet = Boolean(options.quiet);
    const verbose = (!quiet && options.verbose) ? true : false;
    const spinner = new Spinner({ message: 'Running tests…' });

    const passes = [];
    for (const testFile of testFiles) {
        if (!quiet) {
            spinner.start();
        }

        const specification = new TestSpecification();
        try {
            specification.loadFromFile(testFile);
            if (!specification.valid) {
                for (const err of specification.errors) {
                    console.error(err);
                }
                Deno.exit(3)
            }
        } catch(err) {
            if (err instanceof Error && err.name == 'NotFound') {
                console.error(`No such test file ${testFile}`);
                Deno.exit(3);
            } else if (err instanceof Error && err.name == 'IsADirectory') {
                console.error(`${testFile} is a directory: please pass one or more files to test.`);
                Deno.exit(3);
            } else {
                console.error(
                    `Encountered an unexpected error when reading the test file "${testFile}".\n` +
                        "Make sure that the file exists and is an actual file.\n"
                )
                Deno.exit(3);
            }
        }

        const [passed, counts, failures] = specification.runTests(references);

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

//////////
// Helper functions

/**
 * Load CSL-JSON files.
 *
 * @param files An array of the paths of the files to load.
 * @returns An array containing all items loaded from the CSL-JSON files.
 */
function loadCSLReferenceFiles(files: string[]): CSL.Data[] {
    const references: CSL.Data[] = [];
    for (const file of files) {
        try {
            references.push(...JSON.parse(Deno.readTextFileSync(file)));
        } catch (err) {
            const errorMessage =
                `Could not parse CSL-JSON reference file "${file}". You may need to\n` +
                '  export it again from your reference management software (e.g. Zotero).\n'
            if (err instanceof SyntaxError) {
                console.error(
                     errorMessage +
                    'If you wrote the JSON file yourself, you need to fix the syntax. Parsing error was:\n' +
                    `  '${err.message}'.` + "\n"
                );
            } else if (err instanceof TypeError) {
                 console.error(errorMessage);
            } else {
                console.error(
                    "Encountered an unexpected error when reading the CSL-JSON files.\n" +
                    "Make sure the JSON files in the `tests` directory are all valid CSL-JSON files.\n"
                );
            }
            throw new StopProcessError();
        }
    }
    return references;
}

class StopProcessError extends Error {}
