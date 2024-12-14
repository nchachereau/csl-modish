import citeproc from 'citeproc';
import * as path from "jsr:@std/path";

export class UnregisteredItemError extends Error {
    constructor(itemIdentifier) {
        const message = `Item ${itemIdentifier} not registered. Pass it to registerItems() first.`;
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
                const localeFilePath = path.join(
                    import.meta.dirname,
                    '..',
                    'locales',
                    `locales-${l}.xml`
                );
                return Deno.readTextFileSync(localeFilePath);
            },
            retrieveItem: (id) => this.items[id]
        };
        const style = Deno.readTextFileSync(stylePath);
        this.processor = new citeproc.Engine(sys, style, lang);
    }

    registerItems(references) {
        for (const ref of references) {
            this.items[ref['id']] = ref;
        }
    }

    cite(items) {
        const noteIndex = this.citations.length+1;
        for (const item of items) {
            if (!(item.id in this.items)) {
                throw new UnregisteredItemError(item.id);
            }
        }
        const citation = {
            citationItems: items,
            properties: { noteIndex: noteIndex }
        };
        const [_status, results] = this.processor.processCitationCluster(
            citation,
            this.citations.map((c) => [c[2], c[0]]),
            []
        );
        for (const cited of results) {
            const [pos, formatted, id] = cited;
            this.citations[pos] = [pos+1, formatted, id];
        }
    }

    getCitations() {
        return this.citations.map((c) => c[1]);
    }

    getBibliography() {
        const [_params, entries] = this.processor.makeBibliography();
        const pattern = /<div class="csl-entry">(.+)<\/div>/;
        return entries.map((entry) => entry.trim().replace(pattern, '$1'));
    }
}
