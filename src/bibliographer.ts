import * as CSL from './csl.ts';
// @ts-types="./citeproc.d.ts"
import citeproc from 'citeproc';
import * as path from "jsr:@std/path";

export interface CiteItem {
  id: string,
  locator?: string,
  label?: string
};

export class NoStyleLoadedError extends Error {
    constructor() {
        const message = "Call loadStyle() first."
        super(message);
    }
}

export class UnregisteredItemError extends Error {
    erroneousIdentifier: string;

    constructor(itemIdentifier: string) {
        const message = `Item ${itemIdentifier} not registered. Pass it to registerItems() first.`;
        super(message);
        this.name = "UnregisteredItemError";
        this.erroneousIdentifier = itemIdentifier;
    }
}

export class Bibliographer {
    items: Record<string, CSL.Data>;
    citations: [number, string, string][];
    processor: citeproc.Engine | undefined;

    constructor() {
        this.items = {};
        this.citations = [];
    }

    loadStyle(stylePath: string, lang='en') {
        const sys: citeproc.Sys = {
            retrieveLocale: (l: string) => {
                const localeFilePath = path.join(
                    import.meta.dirname as string,
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

    registerItems(references: CSL.Data[]) {
        for (const ref of references) {
            this.items[ref['id']] = ref;
        }
    }

    cite(items: CiteItem[]) {
        if (this.processor === undefined) {
            throw new NoStyleLoadedError();
        }
        const noteIndex = this.citations.length+1;
        for (const item of items) {
            if (!(item.id in this.items)) {
                throw new UnregisteredItemError(item.id);
            }
        }
        const citation: citeproc.Citation = {
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
        if (this.processor === undefined) {
            throw new NoStyleLoadedError();
        }

        const bibliography = this.processor.makeBibliography();
        if (bibliography === false) {
            // makeBibliography returns false if the citation style does not support bibliographies
            return [];
        }
        const [_params, entries] = bibliography;
        const pattern = /<div class="csl-entry">(.+)<\/div>/;
        return entries.map((entry: string) => entry.trim().replace(pattern, '$1'));
    }
}
