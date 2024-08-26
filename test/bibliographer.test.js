import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import { Bibliographer } from '#bibliographer.js';

const style = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'minimal.csl'),
    'utf-8'
);

const items = [
    {
        'id': 'Book1',
        'type': 'book',
        'author': [ { 'family': 'Smith', 'given': 'John'} ],
        'title': 'Book1',
        'issued': { 'date-parts': [[ 2024, 1, 1 ]] }
    },
    {
        'id': 'Book2',
        'type': 'book',
        'author': [ { 'family': 'Smith', 'given': 'William'} ],
        'title': 'Book2',
        'issued': { 'date-parts': [[ 2024, 1, 1 ]] }
    },
    {
        'id': 'Article1',
        'type': 'article-journal',
        'author': [ { 'family': 'Doe', 'given': 'Jane'} ],
        'title': 'Article1',
        'issued': { 'date-parts': [[ 1990, 12, 31 ]] }
    },
];

describe('Bibliographer', () => {
    let bibliographer;
    beforeEach(() => {
        bibliographer = new Bibliographer({style: style});
        bibliographer.registerItems(items);
    });

    it('returns formatted citations', () => {
        bibliographer.cite(['Book1', 'Article1']);
        bibliographer.cite(['Book2']);
        let citations = bibliographer.getCitations();
        expect(citations).to.have.ordered.members([
            'Smith 2024a; Doe 1990.',
            'Smith 2024b.'
        ]);
    });

    it('formats subsequent citations', () => {
        bibliographer.cite(['Book1']);
        bibliographer.cite(['Book1']);
        let citations = bibliographer.getCitations();
        expect(citations[1]).to.equal('ibid.');
    });

    it('throws an error when item does not exist', () => {
        expect(() => bibliographer.cite('NoSuchBook')).to.throw();
    });

    it('supports defining the locale', () => {
        bibliographer = new Bibliographer({style: style, lang: 'de-DE'});
        bibliographer.registerItems(items);
        bibliographer.cite(['Book1']);
        bibliographer.cite(['Book1']);
        let citations = bibliographer.getCitations();
        expect(citations[1]).to.equal('ebd.');
    });

    it('formats a bibliography with cited items', () => {
        bibliographer.cite(['Book1', 'Book2', 'Article1']);
        let bibliography = bibliographer.getBibliography();
        expect(bibliography).to.have.ordered.members([
            'John Smith, <i>Book1</i>, 2024a.',
            'William Smith, <i>Book2</i>, 2024b.',
            'Jane Doe, Article1, 1990.'
        ]);
    });

});
