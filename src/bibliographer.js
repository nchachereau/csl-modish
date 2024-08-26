import citeproc from 'citeproc';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

export class Bibliographer {
    constructor({style, lang='en'}) {
        const sys = {
            retrieveLocale: (l) => {
                let localeFilePath = path.join(
                    path.dirname(fileURLToPath(import.meta.url)),
                    '..',
                    'locales',
                    `locales-${l}.xml`
                );
                return fs.readFileSync(localeFilePath, 'utf-8');
            },
            retrieveItem: (id) => {
                if (id in this.items) {
                    return this.items[id];
                } else {
                    throw new Error(`Item ${id} not registered`);
                }
            }
        };
        this.processor = new citeproc.Engine(sys, style, lang);
        this.items = {};
        this.citations = [];
    }

    registerItems(references) {
        for (const ref of references) {
            this.items[ref['id']] = ref;
        }
    }

    cite(itemIdentifiers) {
        let noteIndex = this.citations.length+1;
        let citation = {
            citationItems: itemIdentifiers.map((item) => { return { id: item }; }),
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
}
