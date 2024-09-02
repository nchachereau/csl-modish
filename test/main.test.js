import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { assertSpyCall, assertSpyCalls, returnsNext, stub } from "jsr:@std/testing/mock";
import { expect } from 'npm:chai@5';

import { parseInput, test } from '../src/main.js';
import { Bibliographer } from '../src/bibliographer.js';

describe('function parseInput()', () => {

    it('parses citations with locators', () => {
        let inputs = parseInput([
            'Book1 p. 103; Book2 pp. 28-35'
        ]);
        expect(inputs[0]).to.have.deep.ordered.members([
            { id: 'Book1', label: 'page', locator: '103' },
            { id: 'Book2', label: 'page', locator: '28-35' }
        ]);
    });

    it('can parse locators other than page', () => {
        let inputs = parseInput([
            'Book1 fig. 1; Book2 chapter 2; Article § 10'
        ]);
        expect(inputs[0]).to.have.deep.ordered.members([
            { id: 'Book1', label: 'figure', locator: '1' },
            { id: 'Book2', label: 'chapter', locator: '2' },
            { id: 'Article', label: 'paragraph', locator: '10' }
        ]);
    });

});

describe('function test()', () => {

    it('informs that all citations matched their expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2024a.', 'Smith 2024b.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024a.', 'Smith 2024b.']
        ]));

        let passed, failures;
        try {
            [passed, failures] = test({input: input, citations: citations});
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }

        expect(passed).to.be.true;
        expect(failures).to.be.empty;
        assertSpyCall(citeStub, 0, { args: [ [ { id: 'Book1' } ] ]});
        assertSpyCall(citeStub, 1, { args: [ [ { id: 'Book2' } ] ]});
        assertSpyCalls(citeStub, 2);
        assertSpyCalls(getCitationsStub, 1);
    });

    it('reports citations not matching their expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2012.', 'Doe 1995.']
        ]));

        let passed, failures;
        try {
            [passed, failures] = test({input: input, citations: citations});
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({expected: 'Smith 2015.', actual: 'Doe 1995.'});
    });

    it('reports that the bibliography matches the expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let bibliography = ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024.', 'Doe 1990.']
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.']
        ]));

        let passed, failures;
        try {
            [passed, failures] = test({input: input, bibliography: bibliography});
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).to.be.true;
        expect(failures).to.be.empty;
    });

    it('reports bibliography not matching expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let bibliography = ['Jane Doe, Book2, 1990.', 'John Smith, Book1, 2024.'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024.', 'Doe 1990.']
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Wrong Name, Other Book, 1990.', 'John Smith, Book1, 2024.']
        ]));

        let passed, failures;
        try {
            [passed, failures] = test({input: input, bibliography: bibliography});
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({
            expected: '- Jane Doe, Book2, 1990.\n- John Smith, Book1, 2024.',
            actual: '- Wrong Name, Other Book, 1990.\n- John Smith, Book1, 2024.'
        });
    });

    it('loads the style specified in the specification', () => {
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        let input = [];
        try {
            test({input: input, style: 'test.csl'});
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerLoadStyleStub, 0, {
            args: ['test.csl']
        });
    });

    it('supports series of tests', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2012.', 'Doe 1995.']
        ]));

        let passed, failures;
        try {
            [passed, failures] = test({tests: [{input: input, citations: citations}]});
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({expected: 'Smith 2015.', actual: 'Doe 1995.'});
    });

});
