import { Command } from "commander";
import * as colors from "jsr:@std/fmt/colors";

import { walk } from "jsr:@std/fs/walk";

import type * as CSL from "./csl.ts";

import { type TestResultSummary, TestSpecification } from "./specification.ts";
import { diffWithColors, expandFileArguments } from "./utils.ts";
import metadata from "../deno.json" with { type: "json" };

//////////
// Define the commands available on the command line

if (import.meta.main) {
  if (!Deno.stdout.isTerminal()) {
    colors.setColorEnabled(false);
  }

  const program = new Command();
  program
    .name("modish")
    .description(metadata.description)
    .version(metadata.version);

  program
    .command("test")
    .description("Run tests")
    .option("-b, --bail", "abort after first test failure")
    .option("-q, --quiet", "suppress all normal output")
    .option("--verbose", "output status for each file")
    .argument("[test-files...]")
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
  options: TestingCmdOptions = { bail: false, quiet: false, verbose: false },
) {
  if (testFiles.length == 0) {
    const files = await Array.fromAsync(walk("tests/", { exts: [".yml"] }));
    testFiles = files.map((f) => f.path);
    testFiles.sort();
  } else if (Deno.build.os == "windows") {
    testFiles = await expandFileArguments(testFiles);
  }

  const refFiles = await Array.fromAsync(walk("tests/", { exts: [".json"] }));
  const referenceFiles = refFiles.map((f) => f.path);
  if (referenceFiles.length == 0) {
    console.error(
      "No CSL-JSON file was found in the `tests` directory. Modish needs at least one\n" +
        "such file containing the bibliographic entries for the tests. Create a \n" +
        "CSL-JSON reference file, for instance by exporting it from your reference\n" +
        "software (e.g. Zotero).",
    );
    Deno.exitCode = 3;
    return;
  }
  let references: CSL.Data[];
  try {
    references = await loadCSLReferenceFiles(referenceFiles);
  } catch (_err) {
    Deno.exitCode = 3;
    return;
  }

  let testSpecifications: Record<string, TestSpecification>;
  try {
    testSpecifications = await loadTestSpecifications(testFiles);
  } catch (_err) {
    Deno.exitCode = 3;
    return;
  }

  const passes: boolean[] = [];
  for (const [testFile, specification] of Object.entries(testSpecifications)) {
    const results = specification.runTests(references);
    reportResults(testFile, results, options);
    const passed = results[0];
    passes.push(passed);
    if (!passed && options.bail) {
      break;
    }
  }

  const allPassed = !passes.includes(false);

  if (!options.quiet) {
    const checkMark = allPassed ? colors.green("✔") : colors.red("✘");
    const numPassed = passes.filter((passed) => passed).length;
    console.log(
      `${checkMark} Ran ${passes.length} test files, ${numPassed} passed`,
    );
  }

  Deno.exitCode = allPassed ? 0 : 2;
}

//////////
// Helper functions

class StopProcessError extends Error {}

/**
 * Load CSL-JSON files.
 *
 * @param files An array of the paths of the files to load.
 * @returns An array containing all items loaded from the CSL-JSON files.
 */
async function loadCSLReferenceFiles(files: string[]): Promise<CSL.Data[]> {
  const references: CSL.Data[] = [];

  const texts = await Promise.all(files.map((file) => Deno.readTextFile(file)));

  for (let i = 0; i < texts.length; i++) {
    try {
      references.push(...JSON.parse(texts[i]));
    } catch (err) {
      const errorMessage =
        `Could not parse CSL-JSON reference file "${
          files[i]
        }". You may need to\n` +
        "  export it again from your reference management software (e.g. Zotero).\n";
      if (err instanceof SyntaxError) {
        console.error(
          errorMessage +
            "If you wrote the JSON file yourself, you need to fix the syntax. Parsing error was:\n" +
            `  '${err.message}'.` + "\n",
        );
      } else if (err instanceof TypeError) {
        console.error(errorMessage);
      } else {
        console.error(
          "Encountered an unexpected error when reading the CSL-JSON files.\n" +
            "Make sure the JSON files in the `tests` directory are all valid CSL-JSON files.\n",
        );
      }
      throw new StopProcessError();
    }
  }
  return references;
}

/**
 * Load test files as TestSpecification.
 *
 * @param testFiles Array containing the paths to the test files to load.
 * @returns An object mapping test file paths to TestSpecification objects.
 */
async function loadTestSpecifications(testFiles: string[]) {
  const testSpecifications: Record<string, TestSpecification> = {};

  const loadedSpecifications = testFiles.map(async function(testFile): Promise<[string, TestSpecification]> {
    const specification = new TestSpecification();
    try {
      await specification.loadFromFile(testFile);
      if (!specification.valid) {
        for (const err of specification.errors) {
          console.error(err);
        }
        throw new StopProcessError();
      }
    } catch (err) {
      if (err instanceof Error && err.name == "NotFound") {
        console.error(`No such test file ${testFile}`);
      } else if (err instanceof Error && err.name == "IsADirectory") {
        console.error(
          `${testFile} is a directory: please pass one or more files to test.`,
        );
      } else {
        console.error(
          `Encountered an unexpected error when reading the test file "${testFile}".\n` +
            "Make sure that the file exists and is an actual file.\n",
        );
      }
      throw new StopProcessError();
    }
    return [testFile, specification];
  });

  for (const [testFile, specification] of await Promise.all(loadedSpecifications)) {
    testSpecifications[testFile] = specification;
  }
  return testSpecifications;
}

/**
 * Log to the console the results from running one test specification.
 *
 * @param testFile The name of the file specifying the tests that were run.
 * @param results The results from running the test specification.
 * @param options Options defining how much to display.
 */
function reportResults(
  testFile: string,
  results: TestResultSummary,
  options: TestingCmdOptions,
) {
  const quiet = Boolean(options.quiet);
  if (quiet) {
    return;
  }
  const verbose = (!quiet && options.verbose) ? true : false;

  const [passed, counts, failures] = results;

  const checkMark = passed ? colors.green("✔") : colors.red("✘");
  if (verbose || failures.length) {
    console.log(` ${checkMark} ${testFile}`);
  }
  if (verbose) {
    let message = "";
    message += `${counts.citations[0]}/${
      counts.citations.reduce((a, b) => a + b)
    } citation checks passed;`;
    message += ` ${counts.bibliography[0]}/${
      counts.bibliography.reduce((a, b) => a + b)
    } bibliography checks passed.`;
    console.log(`   ${message}`);
  }

  for (const fail of failures) {
    if (fail.type == "error") {
      console.log(
        `   - ${colors.brightRed("error")}: ${
          fail.error.replace(/\n/g, "\n     ")
        }`,
      );
    } else if (fail.type == "citation") {
      const [expected, actual] = diffWithColors(fail.expected, fail.actual);
      console.log(`   - expected citation:\n     ${expected}`);
      console.log(`     but output was:\n     ${actual}`);
    } else if (fail.type == "bibliography") {
      const [expected, actual] = diffWithColors(fail.expected, fail.actual);
      console.log("   - expected following bibliography:");
      console.log(expected.replace(/^- /gm, "      - "));
      console.log("     but output was:");
      console.log(actual.replace(/^- /gm, "      - "));
    }
  }

  if (verbose || failures.length) {
    console.log("");
  }
  if (!passed && options.bail) {
    console.log(colors.red("Stopped after first failed test encountered."));
  }
}
