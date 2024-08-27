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

export class Specification {
    constructor(specification) {
        this.inputs = [];
        for (let rawInput of specification.input) {
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
            this.inputs.push(parsedInput);
        }
    }
}
