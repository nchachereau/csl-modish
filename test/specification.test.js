import { expect } from 'chai';

import { Specification } from '#specification.js';

describe('Specification', () => {

    it('parses citations with locators', () => {
        let spec = new Specification({
            input: [
                'Book1 p. 103; Book2 pp. 28-35'
            ]
        });
        expect(spec.inputs[0]).to.have.deep.ordered.members([
            { id: 'Book1', label: 'page', locator: '103' },
            { id: 'Book2', label: 'page', locator: '28-35' }
        ]);
    });

});
