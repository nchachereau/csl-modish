import { describe, it } from "jsr:@std/testing/bdd";
import { assertSpyCall, assertSpyCalls, returnsNext, stub, spy } from "jsr:@std/testing/mock";
import { expect } from "jsr:@std/expect";

import { runOneTestSpecification } from '../src/testRunners.ts';
import { Bibliographer, UnregisteredItemError } from '../src/bibliographer.ts';

describe('function runOneTestSpecification()', () => {

    it('registers items to cite', () => {
        const items = [
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
            runOneTestSpecification({input: [], style: 'test.csl'}, items);
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerRegisterItemsSpy, 0, {
            args: [ items ]
        });
    });

    it('informs that all citations matched their expected output', () => {
        const input = [ 'Book1', 'Book2' ];
        const citations = [ 'Smith 2024a.', 'Smith 2024b.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024a.', 'Smith 2024b.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = runOneTestSpecification({
                style: 'style.csl',
                input: input,
                citations: citations
            }, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }

        expect(passed).toBe(true);
        expect(failures).toHaveLength(0);
        expect(counts.citations).toMatchObject([2, 0]);
        assertSpyCall(citeStub, 0, { args: [ 'Book1' ] });
        assertSpyCall(citeStub, 1, { args: [ 'Book2' ] });
        assertSpyCalls(citeStub, 2);
        assertSpyCalls(getCitationsStub, 1);
    });

    it('reports citations not matching their expected output', () => {
        const input = [ 'Book1', 'Book2' ];
        const citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2012.', 'Doe 1995.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = runOneTestSpecification({
                style: 'style.csl',
                input: input,
                citations: citations
            }, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).toBe(false);
        expect(counts.citations).toMatchObject([1, 1]);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatchObject({type: 'citation', expected: 'Smith 2015.', actual: 'Doe 1995.'});
    });

    it('reports that the bibliography matches the expected output', () => {
        const input = [ 'Book1', 'Book2' ];
        const bibliography = ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024.', 'Doe 1990.']
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = runOneTestSpecification({
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
        expect(passed).toBe(true);
        expect(counts.bibliography).toMatchObject([1, 0]);
        expect(failures).toHaveLength(0);
    });

    it('reports bibliography not matching expected output', () => {
        const input = [ 'Book1', 'Book2' ];
        const bibliography = ['Jane Doe, Book2, 1990.', 'John Smith, Book1, 2024.'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024.', 'Doe 1990.']
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Wrong Name, Other Book, 1990.', 'John Smith, Book1, 2024.']
        ]));

        let passed, counts, failures;
        try {
            [passed, counts, failures] = runOneTestSpecification({
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
        expect(passed).toBe(false);
        expect(counts.bibliography).toMatchObject([0, 1]);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatchObject({
            type: 'bibliography',
            expected: '- Jane Doe, Book2, 1990.\n- John Smith, Book1, 2024.',
            actual: '- Wrong Name, Other Book, 1990.\n- John Smith, Book1, 2024.'
        });
    });

    it('reports failure if no inputs are specified', () => {
        const citations = ['Smith 2024.', 'Doe 1990.'];

        const [passed, _counts, failures] = runOneTestSpecification({style: 'style.csl', citations: citations}, []);

        expect(passed).toBe(false);
        expect(failures[0].type).toEqual('error');
        expect(failures[0].error).toMatch(/\binput\b/);
    });

    it('reports failure if neither citation nor bibliography are specified', () => {
        const input = [ 'Book1', 'Book2' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2024.', 'Doe 1990.']
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.']
        ]));

        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification({style: 'style.csl', input: input}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
            getBibliographyStub.restore();
        }
        expect(passed).toBe(false);
        expect(failures[0]).toMatchObject({
            type: 'error',
            error: 'Please specify expected output (citations and/or bibliography) in your test(s).'
        });
    });

    it('loads the style specified in the specification', () => {
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const input = [];
        try {
            runOneTestSpecification({input: input, style: 'test.csl'}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerLoadStyleStub, 0, {
            args: ['test.csl', undefined]
        });
    });

    it('uses the language specified in the test', () => {
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const input = [];
        try {
            runOneTestSpecification({input: input, style: 'test.csl', lang: 'de-CH'}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
        }
        assertSpyCall(bibliographerLoadStyleStub, 0, {
            args: ['test.csl', 'de-CH']
        });
    });

    it('reports a failure when style file does not exist', () => {
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([]));
        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification(
                {
                    style: 'xtestz.csl',
                    input: [ 'Book1' ],
                    citations: [ 'Smith 2012.' ]
                },
                []);
        } finally {
            citeStub.restore();
        }
        expect(passed).toBe(false);
        expect(failures[0]).toHaveProperty('error');
        assertSpyCalls(citeStub, 0);
    });

    it('reports a failure when identifier not found in references', () => {
        const input = ['Book1'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([new UnregisteredItemError(input[0])]));

        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification(
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
        expect(passed).toBe(false);
        expect(failures[0]).toHaveProperty('error');
        expect(failures[0].error).toEqual(expect.stringContaining(input[0]));
    });

    it('supports series of tests', () => {
        const localInput = [ 'Book1', 'Book2' ];
        const globalInput = [ 'Wrong1' ];
        const citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            ['Smith 2012.', 'Doe 1995.']
        ]));

        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification(
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
        expect(passed).toBe(false);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatchObject({type: 'citation', expected: 'Smith 2015.', actual: 'Doe 1995.'});
        assertSpyCall(citeStub, 0, {args: [ 'Book1' ]});
        assertSpyCall(citeStub, 1, {args: [ 'Book2' ]});
    });

    it('uses style defined in test case', () => {
        const input = [ 'Book1', 'Book2' ];
        const citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const styleName = 'test.csl';
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            citations
        ]));

        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification({tests: [{style: styleName, input: input, citations: citations}]}, []);
        } finally {
            bibliographerLoadStyleStub.restore();
            citeStub.restore();
            getCitationsStub.restore();
        }
        expect(passed).toBe(true);
        expect(failures).toHaveLength(0);
        assertSpyCall(bibliographerLoadStyleStub, 0, {args: [styleName, undefined]});
    });

    it('can use input defined globally', () => {
        const input = [ 'Book1', 'Book2' ];
        const citations = [ 'Smith 2012.', 'Smith 2015.' ];
        const styleName = 'test.csl';
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            citations
        ]));

        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification(
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
        expect(passed).toBe(true);
        expect(failures).toHaveLength(0);
        assertSpyCall(citeStub, 0, {args: [ 'Book1' ]});
        assertSpyCall(citeStub, 1, {args: [ 'Book2' ]});
    });

    it('should not use global expected outputs if input is defined in test case', () => {
        const input = [ 'Book1', 'Book2' ];
        const citations = ['Smith 2024.', 'Doe 1990.'];
        const bibliography = ['Jane Doe, Book2, 1990.', 'John Smith, Book1, 2024.'];
        const bibliographerLoadStyleStub = stub(Bibliographer.prototype, 'loadStyle', returnsNext([true]));
        const citeStub = stub(Bibliographer.prototype, 'addCitation', returnsNext([[], []]));
        const getCitationsStub = stub(Bibliographer.prototype, 'getCitations', returnsNext([
            citations
        ]));
        const getBibliographyStub = stub(Bibliographer.prototype, 'getBibliography', returnsNext([
            ['Wrong Name, Other Book, 1990.', 'John Smith, Book1, 2024.']
        ]));

        let passed, _counts, failures;
        try {
            [passed, _counts, failures] = runOneTestSpecification(
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
        expect(passed).toBe(true);
        expect(failures).toHaveLength(0);
    });

});
