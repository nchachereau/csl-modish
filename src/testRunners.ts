import { Bibliographer, UnregisteredItemError } from './bibliographer.ts';
import { type TestSpecification } from './specification.ts';

import type * as CSL from './csl.ts';


/** Details of a test failed because of errors in the test specification. */
export interface ErrorFailure {
    /** Failure type: error. */
    type: 'error';
    /** A message explaining the error. */
    error: string;
}
/** Details of a failed citation formatting. */
export interface CitationFailure {
    /** Failure type: citation */
    type: 'citation';
    /** The formatted citation. */
    actual: string;
    /** The expected formatted citation. */
    expected: string;
}
/** Details of a failed bibliography formatting. */
export interface BibliographyFailure {
    /** Failure type: bibliography. */
    type: 'bibliography';
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

/**
 * Run the test(s) contained in one valid specification.
 *
 * @param specification The test specification.
 * @param items The items cited in the test specification.
 * @returns A summary of the test results.
 */
export function runOneTestSpecification(specification: TestSpecification, items: CSL.Data[]): TestResultSummary {
    // if `tests` is not specified, assume that there is only one global test
    const tests = specification.tests ?? [specification];

    let passed = false;
    const counts: TestResults = { citations: [0, 0], bibliography: [0, 0] };
    const failures: Failure[] = [];
    for (const testCase of tests) {
        // if the test case does not specify the input, use the global definition
        const inputs = testCase.input ?? specification.input;
        if (inputs === undefined) {
            failures.push({
                type: 'error',
                error: 'Please specify `input`, the list of references to be formatted.'
            });
            continue;
        }
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
                bibliographer.addCitation(input);
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
