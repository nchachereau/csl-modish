import { Command } from 'commander';
import { colors } from '@cliffy/ansi/colors';
import * as yaml from "jsr:@std/yaml";
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
        try {
            bibliographer.loadStyle(style);
        } catch(err) {
            if (err.code == 'ENOENT') {
                failures.push({
                    type: 'error',
                    error: `No such CSL file: ${style}`
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

function testCommand(testFile) {
    const references = JSON.parse(Deno.readTextFileSync('tests/references.json'));
    const spec = yaml.parse(Deno.readTextFileSync(testFile));
    const [passed, counts, failures] = test(spec, references);

    let checkMark = passed ? colors.green('✔') : colors.red('✘');
    console.log(`${checkMark} ${testFile}`);
    let message = '';
    message += `${counts.citations[0]}/${counts.citations.reduce((a, b) => a+b)} citation checks passed;`;
    message += ` ${counts.bibliography[0]}/${counts.bibliography.reduce((a, b) => a+b)} bibliography checks passed.`;
    console.log(`  ${message}`);

    for (let fail of failures) {
        if (fail.type == 'error') {
            console.log(`  - error: ${fail.error}`);
        } else if (fail.type == 'citation') {
            console.log(`  - expected citation: ${fail.expected}`);
            console.log(`    but output was: ${fail.actual}`);
        } else if (fail.type == 'bibliography') {
            console.log('  - expected following bibliography:');
            console.log(fail.expected.replace(/^- /gm, '     - '));
            console.log('    but output was:');
            console.log(fail.actual.replace(/^- /gm, '     - '));
        }
    }
    console.log('');
    Deno.exitCode = passed ? 0 : 1;
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
        .argument('<test_file>')
        .action(testCommand);

    program.parse();
}
