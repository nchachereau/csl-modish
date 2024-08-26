import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import { Bibliographer } from '#bibliographer.js';

const style = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'minimal.csl'),
    'utf-8'
);

const bibliography = [
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
        'author': [ { 'family': 'Dupont', 'given': 'Jean'} ],
        'title': 'Book2',
        'issued': { 'date-parts': [[ 2000, 1, 1 ]] }
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
        bibliographer.registerItems(bibliography);
    });

    it('returns formatted citations', () => {
        let citation = bibliographer.cite(['Book1', 'Article1']);
        expect(citation).to.equal('Smith 2024; Doe 1990');
        citation = bibliographer.cite(['Book2']);
        expect(citation).to.equal('Dupont 2000');
    });

    it('formats subsequent citations', () => {
        bibliographer.cite(['Book1']);
        let citation = bibliographer.cite(['Book1']);
        expect(citation).to.equal('ibid.');
    });

    it('throws an error when item does not exist', () => {
        expect(() => bibliographer.cite('NoSuchBook')).to.throw();
    });

    it('supports defining the locale', () => {
        bibliographer = new Bibliographer({style: style, lang: 'de-DE'});
        bibliographer.registerItems(bibliography);
        bibliographer.cite(['Book1']);
        let citation = bibliographer.cite(['Book1']);
        expect(citation).to.equal('ebd.');
    });

});
