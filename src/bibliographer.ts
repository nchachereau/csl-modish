import type * as CSL from './csl.ts';
// @ts-types="./citeproc.d.ts"
import citeproc from 'citeproc';
import * as path from "jsr:@std/path";

/** Items for {@linkcode cite}. */
export interface CiteItem {
    /** The `id` of the registered item to cite. */
    id: string,
    /**
     * A label type, indicating whether the locator is to a page, a chapter, or
     * other subdivision of the target resource. Valid labels are defined in the
     * [CSL specification](https://docs.citationstyles.org/en/stable/specification.html). */
    label?: string,
    /** A string identifying a page number or other location or range. */
    locator?: string
};

/** Thrown when attempting to cite without having loaded a style. */
export class NoStyleLoadedError extends Error {
    constructor() {
        const message = "Call loadStyle() first."
        super(message);
    }
}

/** Thrown when trying to cite an item that has not been registered by calling {@linkcode registerItems}. */
export class UnregisteredItemError extends Error {
    /** The passed `id` that was not found in the registered items. */
    erroneousIdentifier: string;

    /** Construct a new instance.
     *
     * @param itemIdentifier The `id` that was not found in the registered items.
     */
    constructor(itemIdentifier: string) {
        const message = `Item ${itemIdentifier} not registered. Pass it to registerItems() first.`;
        super(message);
        this.name = "UnregisteredItemError";
        this.erroneousIdentifier = itemIdentifier;
    }
}

/**
 * Workflow of registering items, referencing these items and obtaining formatted
 * citations and bibliographies.
 *
 * This is a wrapper around [citeproc-js](https://citeproc-js.readthedocs.io/),
 * making it easier to use it for simple cases.
 *
 * @example Usage
 * ```js
 * const bibliographer = new Bibliographer();
 * bibliographer.loadStyle('chicago-author-date-16th-edition.csl');
 *
 * // register items to be cited
 * // Note: you would likely load the items from an external CSL-JSON file, e.g.:
 * // const items = JSON.parse(await Deno.readTextFile('biblio.json'));
 * const items = [
 *   {
 *     "id": "Marx1867",
 *     "type":
 *     "book", "author": { "family": "Marx", "given": "Karl" },
 *     "title": "Das Kapital: Kritik der politischen Oekonomie",
 *     "publisher-place": "Hamburg",
 *     "publisher": "Verlag von Otto Meissner",
 *     "issued": { "date-parts": [ [ "1867" ] ] },
 *     "volume": "1"
 *   }
 * ];
 * bibliographer.registerItems(items);
 *
 * bibliographer.cite([{ id: 'Smith2024', label: 'page', locator: '102' }]);
 * bibliographer.cite([{ id: 'Smith2024', label: 'page', locator: '103' }]);
 * const citations = bibliographer.getCitations();
 * const bibliography = bibliographer.getBibliography();
 * ```
 */
export class Bibliographer {
    /**
     * Internal store of items that can be cited.
     * @internal
     */
    _items: Record<string, CSL.Data>;
    /**
     * Internal record of citations.
     * @internal
     */
    _citations: [number, string, string][];
    /**
     * Instance of Engine from citeproc-js.
     * @internal
     */
    _processor: citeproc.Engine | undefined;

    /** Construct a new instance. */
    constructor() {
        this._items = {};
        this._citations = [];
    }

    /**
     * Load the style to use for formatting citations and bibliography.
     *
     * @param stylePath Path to the CSL file to load.
     * @param lang The language (RFC 5646) to use for formatting citations.
     *   Defaults to 'en'. Ignored when the style defines a `default-locale`.
     */
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
            retrieveItem: (id) => this._items[id]
        };
        const style = Deno.readTextFileSync(stylePath);
        this._processor = new citeproc.Engine(sys, style, lang);
    }

    /**
     * Register the references that can be cited.
     *
     * @param references Array of items as defined by [CSL-JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html#items).
     */
    registerItems(references: CSL.Data[]) {
        for (const ref of references) {
            this._items[ref['id']] = ref;
        }
    }

    /**
     * Add a citation to one or more registered items.
     *
     * The function does not return anything. Use {@link getCitations} to get
     * the formatted citations and {@link getBibliography} for the bibliography.
     *
     * Citations are added sequentially. A citation cannot be added between two
     * existing citations. This probably makes `Bibliographer` unsuited for actual
     * work with citations. It is sufficient, however, for the purpose of testing
     * CSL styles.
     *
     * @param items Array of {@linkcode CiteItem}
     * @throws {NoStyleLoadedError} Call {@linkcode loadStyle} before calling this function.
     * @throws {UnregisteredItemError} A cited item has not been registered by calling {@linkcode registerItems}.
     */
    cite(items: CiteItem[]) {
        if (this._processor === undefined) {
            throw new NoStyleLoadedError();
        }
        const noteIndex = this._citations.length+1;
        for (const item of items) {
            if (!(item.id in this._items)) {
                throw new UnregisteredItemError(item.id);
            }
        }
        const citation: citeproc.Citation = {
            citationItems: items,
            properties: { noteIndex: noteIndex }
        };
        const [_status, results] = this._processor.processCitationCluster(
            citation,
            this._citations.map((c) => [c[2], c[0]]),
            []
        );
        for (const cited of results) {
            const [pos, formatted, id] = cited;
            this._citations[pos] = [pos+1, formatted, id];
        }
    }

    /**
     * Get array of formatted citations.
     *
     * Formats the citations previously added by calling {@linkcode cite}
     * and returns them, in the same order, as an array.
     *
     * @returns Formatted citations as an array of strings.
     */
    getCitations(): string[] {
        return this._citations.map((c) => c[1]);
    }

    /**
     * Get formatted bibliography of cited items.
     *
     * Formats a bibliography of all items previously cited by calling
     * {@linkcode cite}.
     *
     * @throws {NoStyleLoadedError} Call {@linkcode loadStyle} before calling this function.
     * @returns Formatted bibliography entries as an array of string, or an
     *   empty array if the citation style does not support bibliographies.
     */
    getBibliography(): string[] {
        if (this._processor === undefined) {
            throw new NoStyleLoadedError();
        }

        const bibliography = this._processor.makeBibliography();
        if (bibliography === false) {
            // makeBibliography returns false if the citation style does not support bibliographies
            return [];
        }
        const [_params, entries] = bibliography;
        const pattern = /<div class="csl-entry">(.+)<\/div>/;
        return entries.map((entry: string) => entry.trim().replace(pattern, '$1'));
    }
}
