import { Command } from "commander";
import * as colors from "jsr:@std/fmt/colors";

import { walk } from "jsr:@std/fs/walk";
import { debounce } from "jsr:@std/async/debounce";
import { realPathSync } from "jsr:@std/fs/unstable-real-path";

import type * as CSL from "./csl.ts";

import { type TestResultSummary, TestSpecification } from "./specification.ts";
import { resetBibliographerCache } from "./bibliographer.ts";
import { diffWithColors, expandFileArguments } from "./utils.ts";
import metadata from "../deno.json" with { type: "json" };

//////////
// Define the commands available on the command line

if (import.meta.main) {
  if (
    !Deno.stdout.isTerminal() && !Deno.env.get("FORCE_COLOR") &&
    !Deno.env.get("CLICOLOR_FORCE")
  ) {
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
    .option("--verbose", "output results for all test files")
    .option("-w, --watch", "rerun tests when files change")
    .argument("[test-files...]")
    .action(testingCommand);

  program.parse();
}

//////////
// Functions executed when the commands are called

/** Options for {@linkcode testingCommand} */
export interface TestingCommandOptions {
  /** abort after first failure */
  bail: boolean;
  /** suppress all output */
  quiet: boolean;
  /** output status for each test file */
  verbose: boolean;
  /** rerun tests when files change */
  watch: boolean;
}

/**
 * Function called when the user runs `modish test`.
 *
 * @param testFiles List of files containing the tests to be run.
 * @param options Options, passed on the command line
 */
export async function testingCommand(
  testFiles: string[],
  options: TestingCommandOptions = {
    bail: false,
    quiet: false,
    verbose: false,
    watch: false,
  },
) {
  let toWatch = new Set<string>();

  if (testFiles.length == 0) {
    toWatch.add("tests");

    try {
      const files = await Array.fromAsync(walk("tests/", { exts: [".yml"] }));
      testFiles = files.map((f) => realPathSync(f.path));
      testFiles.sort();
    } catch (err) {
      if (err instanceof Error && err.name == "NotFound") {
        console.error(
          colors.red("Error:"),
          "No directory `tests`. Create a directory named `tests`" +
            " containing your tests and at least CSL-JSON reference file.",
        );
        Deno.exitCode = 3;
        return;
      } else {
        printCallForBugReport();
        throw err;
      }
    }
  } else {
    if (Deno.build.os == "windows") {
      testFiles = await expandFileArguments(testFiles);
    }
    testFiles = testFiles.map((f) => realPathSync(f));
    testFiles.sort();
  }
  toWatch = toWatch.union(new Set([...testFiles]));

  const refFiles = await Array.fromAsync(walk("tests/", { exts: [".json"] }));
  const referenceFiles = refFiles.map((f) => realPathSync(f.path)).sort();
  if (referenceFiles.length == 0) {
    console.error(
      colors.red("Error:"),
      "No CSL-JSON file was found in the `tests` directory. Modish needs at least one " +
        "such file containing the bibliographic entries for the tests. Create a " +
        "CSL-JSON reference file, for instance by exporting it from your reference " +
        "software (e.g. Zotero).",
    );
    Deno.exitCode = 3;
    return;
  }
  toWatch = toWatch.union(new Set([...referenceFiles]));

  let references: Map<string, CSL.Data[]>;
  references = await loadCSLReferenceFiles(referenceFiles);
  if (references.size === 0) {
    Deno.exitCode = 3;
    return;
  }

  let testSpecifications: Map<string, TestSpecification>;
  testSpecifications = await loadTestSpecifications(testFiles);
  if (testSpecifications.size === 0) {
    console.error(
      colors.red("Error:"),
      "Could not load any valid test file. Ensure you have at least one test " +
        "file (in YAML format), without errors, in the `tests` directory.",
    );
    Deno.exitCode = 3;
    return;
  }

  let styleFiles = getStyleFiles(testSpecifications);
  toWatch = toWatch.union(new Set([...styleFiles]));

  const allPassed = runAllTests(testSpecifications, references, options);

  Deno.exitCode = allPassed ? 0 : 2;

  if (!options.watch) {
    return;
  }

  if (options.quiet) {
    console.error(
      colors.red("Warning:"),
      "--watch option is incompatible with --quiet",
    );
    return;
  }

  console.log(colors.blue("\nWaiting for changes…"));
  while (true) {
    // We wrap the file watcher in this infinite loop so that we can adapt the
    // list of files to watch.

    let specsToReLoad = new Set<string>();
    let refsToReLoad = new Set<string>();
    const watcher = Deno.watchFs([...toWatch]);

    if (testSpecifications.size == 0) {
      console.error("No test left, nothing to run. Aborting.");
      Deno.exitCode = 3;
      break;
    }

    // define this function here because it changes variables such as
    // testSpecifications, references, toWatch…
    const reloadFilesAndRunTests = debounce(
      async function reloadAndRun() {
        console.log(colors.blue("Changes detected, running tests\n"));

        let reloadedSpecifications = await loadTestSpecifications([
          ...specsToReLoad,
        ]);
        const newSpecificationsToWatch = [...specsToReLoad].filter((f) =>
          !toWatch.has(f)
        );
        if (newSpecificationsToWatch.length > 0) {
          toWatch = toWatch.union(new Set([...newSpecificationsToWatch]));
          // stop watcher so that it gets restarted with new list of files
          watcher.close();
        } else if (testSpecifications.size == 0) {
          watcher.close();
        }
        // merge test specifications, with reloaded specifications overriding
        // previously loaded specifications
        testSpecifications = new Map([
          ...testSpecifications,
          ...reloadedSpecifications,
        ]);
        specsToReLoad = new Set<string>();

        let reloadedReferences = await loadCSLReferenceFiles([...refsToReLoad]);
        const newReferenceFilesToWatch = [...refsToReLoad].filter((f) =>
          !toWatch.has(f)
        );
        if (newReferenceFilesToWatch.length > 0) {
          toWatch = toWatch.union(new Set([...newReferenceFilesToWatch]));
          watcher.close();
        }
        references = new Map([...references, ...reloadedReferences]);
        refsToReLoad = new Set<string>();

        const oldStyleFiles = styleFiles;
        styleFiles = getStyleFiles(testSpecifications);
        if (
          styleFiles.size !== oldStyleFiles.size ||
          !styleFiles.isSubsetOf(oldStyleFiles)
        ) {
          // adapt list of watched files
          oldStyleFiles.forEach((f) => toWatch.delete(f));
          toWatch = toWatch.union(new Set([...styleFiles]));
          // stop watcher so that it gets restarted with new list of files
          watcher.close();
        }

        runAllTests(testSpecifications, references, options);
        console.log(colors.blue("\nWaiting for changes…"));
      },
      300,
    );

    // helper functions
    function reloadPath(path: string) {
      if (path.endsWith(".yml")) {
        specsToReLoad.add(path);
        return true;
      } else if (path.endsWith(".json")) {
        refsToReLoad.add(path);
        return true;
      } else if (path.endsWith(".csl")) {
        return resetBibliographerCache(path);
      }
      return false;
    }
    function unloadPath(path: string) {
      toWatch.delete(path);
      if (path.endsWith(".yml")) return testSpecifications.delete(path);
      if (path.endsWith(".json")) return references.delete(path);
      if (path.endsWith(".csl")) return resetBibliographerCache(path);
      return false;
    }

    for await (const event of watcher) {
      if (event.kind == "create" || event.kind == "modify") {
        for (const path of event.paths) {
          if (reloadPath(path)) {
            reloadFilesAndRunTests();
          }
        }
      } else if (event.kind == "remove") {
        for (const path of event.paths) {
          if (unloadPath(path)) {
            reloadFilesAndRunTests();
          }
        }
      } else if (event.kind == "rename") {
        if (event.paths.length == 1) {
          const path = event.paths[0];
          if (reloadPath(path)) {
            reloadFilesAndRunTests();
          }
        } else if (event.paths.length == 2) {
          if (unloadPath(event.paths[0]) || reloadPath(event.paths[1])) {
            reloadFilesAndRunTests();
          }
        }
      }
    }
  }
}

//////////
// Helper functions

/**
 * Load CSL-JSON files.
 *
 * @param files An array of the paths of the files to load.
 * @returns An object mapping the path of each CSL-JSON file to its items.
 */
async function loadCSLReferenceFiles(files: string[]) {
  const references = new Map<string, CSL.Data[]>();

  const texts = await Promise.all(files.map((file) => Deno.readTextFile(file)));

  for (let i = 0; i < texts.length; i++) {
    try {
      const items: CSL.Data[] = [];
      items.push(...JSON.parse(texts[i]));
      references.set(files[i], items);
    } catch (err) {
      const errorMessage =
        `Could not parse CSL-JSON reference file "${files[i]}".` +
        " You may need to export it again from your reference management software (e.g. Zotero).\n";
      if (err instanceof SyntaxError) {
        console.error(
          errorMessage +
            "If you wrote the JSON file yourself, you need to fix the syntax. Parsing error was:\n" +
            `  '${err.message}'.` + "\n",
        );
      } else if (err instanceof TypeError) {
        console.error(errorMessage);
      } else {
        printCallForBugReport();
        throw err;
      }
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
  const testSpecifications = new Map<string, TestSpecification>();

  const loadedSpecifications = testFiles.map(
    async function (testFile): Promise<[string, TestSpecification] | []> {
      const specification = new TestSpecification();
      try {
        await specification.loadFromFile(testFile);
        if (!specification.valid) {
          for (const err of specification.errors) {
            console.error(err);
          }
          console.error("\n");
          return [];
        }
      } catch (err) {
        if (err instanceof Error && err.name == "NotFound") {
          console.error(`No such test file ${testFile}`);
        } else if (err instanceof Error && err.name == "IsADirectory") {
          console.error(
            `${testFile} is a directory: please pass one or more files, and not directories, to test.`,
          );
        } else {
          printCallForBugReport();
          throw err;
        }
        return [];
      }
      return [testFile, specification];
    },
  );

  for (
    const [testFile, specification] of await Promise.all(loadedSpecifications)
  ) {
    if (testFile !== undefined && specification !== undefined) {
      testSpecifications.set(realPathSync(testFile), specification);
    }
  }
  return testSpecifications;
}

/**
 * Get list of style files referenced by TestSpecifications.
 *
 * @param testSpecifications A mapping of strings (test file paths) to
 *   TestSpecification objects.
 * @returns A Set of real paths of style files.
 */
function getStyleFiles(testSpecifications: Map<string, TestSpecification>) {
  let styleFiles = new Set<string>();
  for (const spec of testSpecifications.values()) {
    for (const style of spec.styles) {
      try {
        styleFiles.add(realPathSync(style));
      } catch (err) {
        if (err instanceof Error && err.name == "NotFound") {
          // ignore missing style files, we simply do not add them to watched files
        } else {
          printCallForBugReport();
          throw err;
        }
      }
    }
  }
  return styleFiles;
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
  options: TestingCommandOptions,
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

/**
 * Write an error to console suggesting to report a bug.
 */
function printCallForBugReport() {
  console.error(
    colors.bold(colors.red("Failure:")),
    "could not deal with an unexpected situation. We would be very grateful " +
      " if you could report this error as a bug:\n " +
      colors.blue("https://github.com/nchachereau/csl-modish/issues"),
    "\n",
  );
}

/**
 * Run tests passed as argument and print results.
 *
 * @param testSpecifications A mapping of strings (test file paths) to
 *   TestSpecification objects.
 * @param references An Map of path of each CSL-JSON file to its items.
 * @param options Options defining how much to display.
 * @return Whether all tests passed.
 */
function runAllTests(
  testSpecifications: Map<string, TestSpecification>,
  references: Map<string, CSL.Data[]>,
  options: TestingCommandOptions,
) {
  const passes: boolean[] = [];
  for (const [testFile, specification] of testSpecifications.entries()) {
    let referenceArray: CSL.Data[] = [];
    referenceArray = referenceArray.concat(...references.values());
    const results = specification.runTests(referenceArray);
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
  return allPassed;
}
