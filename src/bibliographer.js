import citeproc from 'citeproc';
import fs from 'node:fs';
import path from 'node:path';

export class UnregisteredItemError extends Error {
    constructor(itemIdentifier) {
        let message = `Item ${itemIdentifier} not registered. Pass it to registerItems() first.`;
        super(message);
        this.name = "UnregisteredItemError";
        this.erroneousIdentifier = itemIdentifier;
    }
}

export class Bibliographer {
    constructor() {
        this.items = {};
        this.citations = [];
    }

    loadStyle(stylePath, lang='en') {
        const sys = {
            retrieveLocale: (l) => {
                let localeFilePath = path.join(
                    import.meta.dirname,
                    '..',
                    'locales',
                    `locales-${l}.xml`
                );
                return fs.readFileSync(localeFilePath, 'utf-8');
            },
            retrieveItem: (id) => this.items[id]
        };
        const style = fs.readFileSync(stylePath, 'utf-8');
        this.processor = new citeproc.Engine(sys, style, lang);
    }

    registerItems(references) {
        for (const ref of references) {
            this.items[ref['id']] = ref;
        }
    }

    cite(items) {
        let noteIndex = this.citations.length+1;
        for (let item of items) {
            if (!item.id in this.items) {
                throw new UnregisteredItemError(item.id);
            }
        }
        let citation = {
            citationItems: items,
            properties: { noteIndex: noteIndex }
        };
        let [status, results] = this.processor.processCitationCluster(
            citation,
            this.citations.map((c) => [c[2], c[0]]),
            []
        );
        for (let cited of results) {
            let [pos, formatted, id] = cited;
            this.citations[pos] = [pos+1, formatted, id];
        }
    }

    getCitations() {
        return this.citations.map((c) => c[1]);
    }

    getBibliography() {
        let [params, entries] = this.processor.makeBibliography();
        const pattern = /<div class="csl-entry">(.+)<\/div>/;
        return entries.map((entry) => entry.trim().replace(pattern, '$1'));
    }
}
