import { describe, it } from "jsr:@std/testing/bdd";
import { assertSpyCall, assertSpyCalls, spy, } from "jsr:@std/testing/mock";
import { expect } from 'npm:chai@5';

import { parseInput, test } from '../src/main.js';

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
        let mockBibliographer = {
            cite(citations) {
            },
            getCitations() {
                return ['Smith 2024a.', 'Smith 2024b.'];
            }
        };
        const citeSpy = spy(mockBibliographer, 'cite');
        const getCitationsSpy = spy(mockBibliographer, 'getCitations');

        let [passed, failures] = test({input: input, citations: citations}, mockBibliographer);
        expect(passed).to.be.true;
        expect(failures).to.be.empty;
        assertSpyCalls(citeSpy, 2);
        assertSpyCalls(getCitationsSpy, 1);
    });

    it('reports citations not matching their expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let citations = [ 'Smith 2012.', 'Smith 2015.' ];
        let mockBibliographer = {
            cite(citations) {
            },
            getCitations() {
                return ['Smith 2012.', 'Doe 1995.'];
            }
        };

        let [passed, failures] = test({input: input, citations: citations}, mockBibliographer);
        expect(passed).to.be.false;
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({expected: 'Smith 2015.', actual: 'Doe 1995.'});
    });

    it('reports that the bibliography matches the expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let bibliography = ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.'];
        let mockBibliographer = {
            cite(citations) {
            },
            getCitations() {
                return ['Smith 2024.', 'Doe 1990.'];
            },
            getBibliography() {
                return ['Jane Doe, Book2, 1990', 'John Smith, Book1, 2024.'];
            }
        };
        const citeSpy = spy(mockBibliographer, 'cite');
        const getBibliographySpy = spy(mockBibliographer, 'getBibliography');

        let [passed, failures] = test({input: input, bibliography: bibliography},
                                      mockBibliographer);
        expect(passed).to.be.true;
        expect(failures).to.be.empty;
        assertSpyCalls(citeSpy, 2);
        assertSpyCalls(getBibliographySpy, 1);
    });

    it('reports bibliography not matching expected output', () => {
        let input = [ 'Book1', 'Book2' ];
        let bibliography = ['Jane Doe, Book2, 1990.', 'John Smith, Book1, 2024.'];
        let mockBibliographer = {
            cite(citations) {
            },
            getCitations() {
                return ['Smith 2024.', 'Doe 1990.'];
            },
            getBibliography() {
                return ['Wrong Name, Other Book, 1990.', 'John Smith, Book1, 2024.'];
            }
        };

        let [passed, failures] = test({input: input, bibliography: bibliography},
                                      mockBibliographer);
        expect(passed).to.be.false;
        expect(failures).to.have.lengthOf(1);
        expect(failures[0]).to.eql({
            expected: '- Jane Doe, Book2, 1990.\n- John Smith, Book1, 2024.',
            actual: '- Wrong Name, Other Book, 1990.\n- John Smith, Book1, 2024.'
        });
    });

});
