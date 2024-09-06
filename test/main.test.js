import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { assertSpyCall, assertSpyCalls, returnsNext, stub, spy } from "jsr:@std/testing/mock";
import { expect } from 'npm:chai@5';

import { parseInput, test } from '../src/main.js';
import { Bibliographer, UnregisteredItemError } from '../src/bibliographer.js';

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

    it('registers items to cite', () => {
        let items = [
            { 'id': 'Book1', 'type': 'book',
              'author': [ { 'family': 'Smith', 'given': 'John'} ],
              'title': 'Book1', 'issued': { 'date-parts': [[ 2024, 1, 1 ]] }
            },
            {
                'id': 'Book2', 'type': 'book',
                'author': [ { 'family': 'Smith', 'given': 'William'} ],
                'title': 'Book2', 'issued': { 'date-parts': [[ 2024, 1, 1 ]] }
            },
        ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const bibliographerRegisterItemsSpy = spy(Bibliographer.prototype, 'registerItems');

        try {
            test({input: [], style: 'test.csl'}, items);
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerRegisterItemsSpy, 0, {
            args: [ items ]
        });
    });

    it('informs that all citations matched their expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2024a.', 'Smith 2024b.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024a.', 'Smith 2024b.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test({
                style: 'style.csl',
                input: input,
                citations: citations
            }, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }

        expect(passed).to.be.true;
        expect(failures).to.be.empty;
        expect(counts.citations).to.eql([2, 0]);
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

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test({
                style: 'style.csl',
                input: input,
                citations: citations
            }, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).to.be.false;
        expect(counts.citations).to.eql([1, 1]);
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({type: 'citation', expected: 'Smith 2015.', actual: 'Doe 1995.'});
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

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test({
                style: 'style.csl',
                input: input,
                bibliography: bibliography
            }, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).to.be.true;
        expect(counts.bibliography).to.eql([1, 0]);
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

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test({
                style: 'style.csl',
                input: input,
                bibliography: bibliography
            }, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).to.be.false;
        expect(counts.bibliography).to.eql([0, 1]);
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({
            type: 'bibliography',
            expected: '- Jane Doe, Book2, 1990.\n- John Smith, Book1, 2024.',
            actual: '- Wrong Name, Other Book, 1990.\n- John Smith, Book1, 2024.'
        });
    });

    it('reports failure if neither citation nor bibliography are specified', () => {
        let input = [ 'Book1', 'Book2' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024.', 'Doe 1990.']
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test({style: 'style.csl', input: input}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures[0]).to.eql({
            type: 'error',
            error: 'Please specify expected output (citations and/or bibliography) in your test(s).'
        });
    });

    it('loads the style specified in the specification', () => {
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        let input = [];
        try {
            test({style: 'style.csl', input: input, style: 'test.csl'}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerLoadStyleStub, 0, {
            args: ['test.csl', undefined]
        });
    });

    it('uses the language specified in the test', () => {
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        let input = [];
        try {
            test({input: input, style: 'test.csl', lang: 'de-CH'}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerLoadStyleStub, 0, {
            args: ['test.csl', 'de-CH']
        });
    });

    it('reports a failure when style file does not exist', () => {
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([]));
        let passed, counts, failures;
        try {
            [passed, counts, failures] = test(
                {
                    style: 'xtestz.csl',
                    input: [ 'Book1' ],
                    citations: [ 'Smith 2012.' ]
                },
                []);
        } finally {
            citeStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures[0]).to.have.property('error');
        assertSpyCalls(citeStub, 0);
    });

    it('reports a failure when identifier not found in references', () => {
        let input = ['Book1'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([new UnregisteredItemError(input[0])]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test(
                {
                    style: 'somestyle.csl',
                    input: input,
                    citations: ['Smith 2012.']
                },
                []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures[0]).to.have.property('error');
        expect(failures[0].error).to.have.string(input[0]);
    });

    it('supports series of tests', () => {
        let localInput = [ 'Book1', 'Book2' ];
        let globalInput = [ 'Wrong1' ];
        let citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2012.', 'Doe 1995.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test(
                {
                    style: 'style.csl',
                    input: globalInput,
                    tests: [{input: localInput, citations: citations}]
                },
                []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).to.be.false;
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({type: 'citation', expected: 'Smith 2015.', actual: 'Doe 1995.'});
        assertSpyCall(citeStub, 0, {args: [[{id: 'Book1'}]]});
        assertSpyCall(citeStub, 1, {args: [[{id: 'Book2'}]]});
    });

    it('uses style defined in test case', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2012.', 'Smith 2015.' ];
        let styleName = 'test.csl';
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            citations
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test({tests: [{style: styleName, input: input, citations: citations}]}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).to.be.true;
        expect(failures).to.be.empty;
        assertSpyCall(bibliographerLoadStyleStub, 0, {args: [styleName, undefined]});
    });

    it('can use input defined globally', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2012.', 'Smith 2015.' ];
        let styleName = 'test.csl';
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            citations
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test(
                {
                    input: input,
                    tests: [
                        {style: styleName, citations: citations}
                    ]
                },
                []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).to.be.true;
        expect(failures).to.be.empty;
        assertSpyCall(citeStub, 0, {args: [ [ { id: 'Book1' } ] ]});
        assertSpyCall(citeStub, 1, {args: [ [ { id: 'Book2' } ] ]});
    });

    it('should not use global expected outputs if input is defined in test case', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = ['Smith 2024.', 'Doe 1990.'];
        let bibliography = ['Jane Doe, Book2, 1990.', 'John Smith, Book1, 2024.'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'cite', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            citations
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Wrong Name, Other Book, 1990.', 'John Smith, Book1, 2024.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = test(
                {
                    style: 'style.csl',
                    bibliography: bibliography,
                    tests: [{input: input, citations: citations}]
                },
                []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).to.be.true;
        expect(failures).to.be.empty;
    });

});
