import { expect } from 'chai';

import { TestSuite } from '#testSuite.js';

describe('TestSuite', () => {

    it('parses citations with locators', () => {
        let testSuite = new TestSuite({
            input: [
                'Book1 p. 103; Book2 pp. 28-35'
            ]
        });
        expect(testSuite.inputs[0]).to.have.deep.ordered.members([
            { id: 'Book1', label: 'page', locator: '103' },
            { id: 'Book2', label: 'page', locator: '28-35' }
        ]);
    });

});
