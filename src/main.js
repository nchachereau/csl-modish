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

export function test(specification, bibliographer) {
    let inputs = parseInput(specification.input);
    for (let input of inputs) {
        bibliographer.cite(inputs);
    }
    let failures = [];
    if ('citations' in specification) {
        let citations = bibliographer.getCitations();
        for (let [i, outputCitation] of citations.entries()) {
            let expected = specification.citations[i];
            if (outputCitation != expected) {
                failures.push({expected: expected, actual: outputCitation});
            }
        }
    }
    if ('bibliography' in specification) {
        let outputBibliography = bibliographer.getBibliography();
        let expectedBiblio = specification.bibliography;
        if (expectedBiblio.length !== outputBibliography.length ||
            !(outputBibliography.every((val, i) => val === expectedBiblio[i]))) {
            let expectedStr = expectedBiblio.map((s) => `- ${s}`).join('\n');
            let outputStr = outputBibliography.map((s) => `- ${s}`).join('\n');
            failures.push({expected: expectedStr, actual: outputStr});
        }
    }
    let passed = (failures.length == 0) ? true : false;
    return [passed, failures];
}
