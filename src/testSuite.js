export class TestSuite {
    constructor(specification) {
        this.inputs = [];
        for (let rawInput of specification.input) {
            let parsedInput = [];
            let items = rawInput.split(';');
            for (let item of items) {
                let parts = item.trim().split(' ').map((part) => part.trim());
                let citationItem = { 'id': parts[0] };
                if (parts.length > 1) {
                    if (parts[1] == 'p.' || parts[1] == 'pp.') {
                        citationItem.label = 'page';
                        citationItem.locator = parts[2];
                    }
                }
                parsedInput.push(citationItem);
            }
            this.inputs.push(parsedInput);
        }
    }
}
