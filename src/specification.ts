import { Ajv2020, type DefinedError } from "ajv/dist/2020.js";
import schema from "./modish.schema.json" with { type: "json" };
import * as yaml from "jsr:@std/yaml";
import { suggestSimilar } from "./suggestSimilar.ts";
import type * as CSL from "./csl.ts";
import {
  type Bibliographer,
  getBibliographer,
  UnregisteredItemError,
} from "./bibliographer.ts";

/** One test specification. */
export interface SingleTestSpecification {
  /** Path to the CSL file to test. */
  style?: string;
  /** Locale to use for this test. */
  lang?: string;
  /** The citations to add during the test. */
  input?: string[];
  /** The expected formatted citations. */
  citations?: string[];
  /** The expected formatted bibliography. */
  bibliography?: string[];
}

/** One or more specified tests. */
export interface TestSpecificationSuite extends SingleTestSpecification {
  /** An array of tests to run. */
  tests?: SingleTestSpecification[];
}

/** Details of a test failed because of errors in the test specification. */
export interface ErrorFailure {
  /** Failure type: error. */
  type: "error";
  /** A message explaining the error. */
  error: string;
}
/** Details of a failed citation formatting. */
export interface CitationFailure {
  /** Failure type: citation */
  type: "citation";
  /** The formatted citation. */
  actual: string;
  /** The expected formatted citation. */
  expected: string;
}
/** Details of a failed bibliography formatting. */
export interface BibliographyFailure {
  /** Failure type: bibliography. */
  type: "bibliography";
  /** The formatted bibliography. */
  actual: string;
  /** The expected formatted bibliography. */
  expected: string;
}
/** Details concerning a test failure */
export type Failure = ErrorFailure | CitationFailure | BibliographyFailure;

/** Number of passed and failed tests. */
export interface TestResults {
  /** Number of passed and failed citations. */
  citations: [passed: number, failed: number];
  /** Number of passed and failed bibliographies. */
  bibliography: [passed: number, failed: number];
}

/** Results from running one test specification. */
export type TestResultSummary = [boolean, TestResults, Failure[]];

function makeOrdinal(n: number): string {
  // we assume that n < 111
  const endings: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  const last_digit = n % 10;
  if (last_digit in endings) {
    return n + endings[last_digit];
  }
  return n + "th";
}

function getPropertyByPath(
  object: Record<string, unknown>,
  path: string,
  removeLast?: boolean,
): unknown;
function getPropertyByPath(
  object: Array<unknown>,
  path: string,
  removeLast?: boolean,
): unknown;
function getPropertyByPath(
  object: object,
  path: string,
  removeLast?: boolean,
): unknown;
function getPropertyByPath(
  object: object | Array<unknown>,
  path: string,
  removeLast = true,
) {
  const keys = path.split("/").filter((e) => e != "#" && e != "");
  if (removeLast) {
    keys.pop();
  }
  let _object: unknown = object;
  for (const key of keys) {
    if (_object && typeof _object == "object") {
      _object = _object[key as keyof typeof _object];
    }
  }
  return _object;
}

function pluralize(verbForm: string) {
  if (verbForm == "is") {
    return "are";
  } else if (verbForm == "does") {
    return "do";
  } else if (verbForm.at(-1) == "s") {
    return verbForm.slice(0, -1);
  } else {
    return verbForm;
  }
}

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile<TestSpecificationSuite>(schema);

export class TestSpecification {
  /**
   * Internal representation of the complete test specification.
   * @internal
   */
  _specification: TestSpecificationSuite;
  /** Whether the test specification is valid. */
  valid: boolean;
  /** List of validation errors when the specification is invalid. */
  errors: string[];

  /** Array of styles used in the tests, as specified. */
  get styles(): string[] {
    const styles = new Set<string>();
    // if `tests` is not specified, assume that there is only one global test
    const tests = this._specification.tests ?? [this._specification];
    for (const testCase of tests) {
      // if the test case does not specify the style, use the globally defined style
      const style = testCase.style ?? this._specification.style;
      if (style !== undefined) {
        styles.add(style);
      }
    }
    return Array.from(styles);
  }

  /** Construct a new instance. */
  constructor() {
    this.valid = false;
    this.errors = [];
    this._specification = {};
  }

  /**
   * Load test specification from a file.
   *
   * @param specificationFile Path to the test file to load.
   */
  async loadFromFile(specificationFile: string) {
    try {
      const spec = yaml.parse(
        await Deno.readTextFile(specificationFile),
        { schema: "failsafe" },
      );
      if (spec === null || typeof spec != "object") {
        this.errors.push(
          `Error encountered when loading file ${specificationFile}.\n` +
            "Check that the contents follow the guidelines for test files.\n",
        );
      } else {
        this.loadFromObject(spec);
        if (!this.valid) {
          this.errors = this.errors.map((e) => ` - ${e}`);
          this.errors.unshift(
            `Encountered error(s) when loading file ${specificationFile}.\n`,
          );
        }
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.errors.push(
          `Error encountered when loading file ${specificationFile}.\n` +
            "Check that the contents follow the guidelines for test files.\n\n" +
            `The error was:\n ${err.message}`,
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Load and validate test specification from object.
   *
   * @param specification Specification object to load.
   */
  loadFromObject(specification: object) {
    this.valid = validate(specification);
    if (this.valid) {
      this._specification = specification;
    } else {
      this.errors = this.getErrorMessages(
        specification,
        validate.errors as DefinedError[],
      );
    }
  }

  /**
   * Turn the errors reported by Ajv into messages useful to our users.
   *
   * @param errors The errors detected by the validating function.
   * @returns The improved error messages.
   */
  getErrorMessages(specification: object, errors: DefinedError[]): string[] {
    const errorMessages: string[] = [];
    let lastArrayProperty: string = "";
    let erroneousItemsInCurrentArray: number[] = [];
    const unknownProperties: [string, string[]][] = [];
    for (const error of errors) {
      const propertyPath = error.instancePath.split("/").filter((e: string) =>
        e !== ""
      );

      // erroneous type
      if (error.keyword == "type") {
        let property = propertyPath.at(-1);
        let item: number = -1;
        if (property !== undefined && /^[0-9]+$/.test(property)) {
          property = propertyPath.at(-2);
          item = Number(propertyPath.at(-1)) + 1;
        }

        // only report 'global level' if there is also a 'tests' level
        let level = "";
        if (propertyPath.length == 1 && "tests" in specification) {
          level = " at the global level";
        } else if (propertyPath[0] == "tests") {
          const n = Number(propertyPath[1]) + 1;
          const ord = makeOrdinal(n);
          level = ` in the ${ord} test`;
        }

        let errorDescription: string = "";
        let verb = "is";
        let advice = "";
        if (error.params.type == "array") {
          errorDescription = (item !== -1) ? "must be lists" : "must be a list";
        } else if (error.params.type == "string") {
          errorDescription = (item !== -1)
            ? "must be strings"
            : "must be a string";
          advice = "Did you forget to add quotation marks?";
        } else if (error.params.type == "object") {
          // gather properties of expected object
          const objectSchema = getPropertyByPath(
            schema,
            error.schemaPath,
          ) as object;
          const properties = Object.keys(
            objectSchema["properties" as keyof typeof objectSchema],
          );
          let propertiesStr: string;
          if (properties.length < 3) {
            propertiesStr = properties.map((p) => `"${p}"`).join(" and ");
          } else {
            propertiesStr = properties.slice(0, -1).map((p) => `"${p}"`).join(
              ", ",
            );
            propertiesStr += ` and "${properties.at(-1)}"`;
          }
          errorDescription =
            `should define properties such as ${propertiesStr}`;
          verb = "does";
          // give advice when array instead of object
          if (
            Array.isArray(
              getPropertyByPath(specification, error.instancePath, false),
            )
          ) {
            if (item !== -1) {
              advice = "It seems the";
              advice += (property == "tests") ? " tests" : " entries";
              advice += " have been erroneously written as lists.";
            } else if (property === undefined) {
              advice =
                "It seems the test specification has been erroneously written as a list.";
            }
          }
        }

        if (item !== -1) {
          // error: wrong type in array

          // same array as previously?
          const currentArrayProperty = propertyPath.slice(0, -1).join("/");
          if (lastArrayProperty == currentArrayProperty) {
            erroneousItemsInCurrentArray.push(item);
            // same array, remove last message before pushing the updated message
            errorMessages.pop();
          } else {
            // new array, reset list of erroneous items
            erroneousItemsInCurrentArray = [item];
          }
          lastArrayProperty = currentArrayProperty;

          // prepare message
          const items = erroneousItemsInCurrentArray.map(makeOrdinal);
          let itemsStr: string;
          if (items.length > 1) {
            itemsStr = `${items.slice(0, -1).join(", ")} and ${
              items.at(-1)
            } entries`;
            verb = pluralize(verb);
          } else {
            itemsStr = `${items.at(-1)} entry`;
          }
          // "All entries in "citations" must be strings"
          // "All entries in "tests" should define properties such as…"
          let err =
            `All entries in "${property}"${level} ${errorDescription}, `;
          const arr = getPropertyByPath(specification, error.instancePath) as
            | object[]
            | string[];
          if (items.length == arr.length) {
            err += `but none ${pluralize(verb)}. ${advice}`;
          } else {
            err += `but the ${itemsStr} ${verb} not. ${advice}`;
          }
          errorMessages.push(err);
        } else if (property !== undefined) {
          // '"style" must be a string. Did you forget to add quotation marks?'
          // '"citations"' in the 2nd test must be a list. '
          errorMessages.push(
            `"${property}"${level} ${errorDescription}. ${advice}`,
          );
        } else {
          // 'the test file should define properties such as…''
          errorMessages.push(`The test file ${errorDescription}. ${advice}`);
        }
        // unknown properties
      } else if (error.keyword == "additionalProperties") {
        const similar = suggestSimilar(
          error.params.additionalProperty,
          Object.keys(schema["properties"]),
        );
        unknownProperties.push([
          error.params.additionalProperty,
          similar,
        ]);
      }
    }
    // warnings about unknown properties
    if (unknownProperties.length) {
      let warning = "Found unknown ";
      if (unknownProperties.length > 1) {
        warning += "properties ";
        warning += unknownProperties.slice(0, -1).map((p) => `"${p[0]}"`).join(
          ", ",
        );
        warning += ` and "${unknownProperties.at(-1)?.[0]}". `;
        const suggestions = unknownProperties.map((p) => {
          if (p[1].length === 0) {
            return "";
          }
          return `${
            p[1].map((pp: string) => `"${pp}"`).join(" or ")
          } instead of "${p[0]}"`;
        }).filter((sugg) => sugg !== "");
        if (suggestions.length > 1) {
          warning += `Did you mean ${suggestions.slice(0, -1).join(", ")}`;
          warning += ` and ${suggestions.at(-1)}?`;
        } else if (suggestions.length) {
          warning += `Did you mean ${suggestions[0]}?`;
        }
      } else {
        const [property, suggestions] = unknownProperties[0];
        warning += `property "${property}".`;
        if (suggestions.length) {
          warning += ` Did you mean ${
            suggestions.map((s: string) => `"${s}"`).join(" or ")
          }?`;
        }
      }
      errorMessages.push(warning);
    }
    return errorMessages;
  }

  /**
   * Run the test(s) contained in the specification.
   *
   * @param items The items cited in the tests.
   * @returns A summary of the test results.
   */
  runTests(items: CSL.Data[]): TestResultSummary {
    // if `tests` is not specified, assume that there is only one global test
    const tests = this._specification.tests ?? [this._specification];

    let passed = false;
    const counts: TestResults = { citations: [0, 0], bibliography: [0, 0] };
    const failures: Failure[] = [];
    for (const testCase of tests) {
      // if the test case does not specify the input, use the global definition
      const inputs = testCase.input ?? this._specification.input;
      if (inputs === undefined) {
        failures.push({
          type: "error",
          error:
            "Please specify `input`, the list of references to be formatted.",
        });
        continue;
      }
      // if the test case does not specify the style, use the globally defined style
      const style = testCase.style ?? this._specification.style;
      const lang = testCase.lang ?? this._specification.lang;
      if (style === undefined) {
        failures.push({
          type: "error",
          error: "Please specify the path of the CSL style to test.",
        });
        continue;
      }
      let bibliographer: Bibliographer;
      try {
        bibliographer = getBibliographer(style, lang);
      } catch (err) {
        if (err instanceof Error && err.name == "NotFound") {
          failures.push({
            type: "error",
            error: err.message,
          });
          continue;
        } else {
          throw err;
        }
      }
      bibliographer.clearCitations();
      bibliographer.registerItems(items);

      const expectedCitations = testCase.citations;
      const expectedBiblio = testCase.bibliography;

      if (expectedCitations === undefined && expectedBiblio === undefined) {
        failures.push({
          type: "error",
          error:
            "Please specify expected output (citations and/or bibliography) in your test(s).",
        });
        continue;
      }

      for (const input of inputs) {
        try {
          bibliographer.addCitation(input);
        } catch (err) {
          if (err instanceof UnregisteredItemError) {
            failures.push({
              type: "error",
              error:
                `No reference ${err.erroneousIdentifier} was found in your CSL-JSON files.`,
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
            failures.push({
              type: "citation",
              expected: expected,
              actual: outputCitation,
            });
            counts.citations[1]++;
          }
        }
        if (unmatchedCitations.length) {
          failures.push({
            type: "error",
            error:
              `Please specify all expected outputs in your test for style ${style}.\n` +
              `The style generated ${outputCitations.length} citations, the test only specified ${expectedCitations.length}.\n` +
              "The additional citations were:\n" + unmatchedCitations.map((s) =>
                `  - ${s}`
              ).join("\n"),
          });
        }
      }
      if (expectedBiblio) {
        const outputBibliography = bibliographer.getBibliography();
        if (
          expectedBiblio.length !== outputBibliography.length ||
          !(outputBibliography.every((val, i) => val === expectedBiblio[i]))
        ) {
          counts.bibliography[1]++;
          const expectedStr = expectedBiblio.map((s) => `- ${s}`).join("\n");
          const outputStr = outputBibliography.map((s) => `- ${s}`).join("\n");
          failures.push({
            type: "bibliography",
            expected: expectedStr,
            actual: outputStr,
          });
        } else {
          counts.bibliography[0]++;
        }
      }
    }
    passed = (failures.length == 0) ? true : false;
    return [passed, counts, failures];
  }
}
