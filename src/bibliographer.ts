import type * as CSL from "./csl.ts";
// @ts-types="./citeproc.d.ts"
import citeproc from "citeproc";
import * as path from "jsr:@std/path";
import { realPathSync } from "jsr:@std/fs/unstable-real-path";

/** Objects passed to the citeproc citation engine. */
export interface CiteItem {
  /** The `id` of the registered item to cite. */
  id: string;
  /**
   * A label type, indicating whether the locator is to a page, a chapter, or
   * other subdivision of the target resource. Valid labels are defined in the
   * [CSL specification](https://docs.citationstyles.org/en/stable/specification.html). */
  label?: string;
  /** A string identifying a page number or other location or range. */
  locator?: string;
}

/** Thrown when attempting to cite without having loaded a style. */
export class NoStyleLoadedError extends Error {
  constructor() {
    const message = "Call loadStyle() first.";
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
    const message =
      `Item ${itemIdentifier} not registered. Pass it to registerItems() first.`;
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
 * bibliographer.addCitation("Marx1867 p. 102");
 * bibliographer.addCitation("Marx1867 p. 103");
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
  loadStyle(stylePath: string, lang = "en") {
    const sys: citeproc.Sys = {
      retrieveLocale: (l: string) => {
        const localeFilePath = path.join(
          import.meta.dirname as string,
          "..",
          "locales",
          `locales-${l}.xml`,
        );
        return Deno.readTextFileSync(localeFilePath);
      },
      retrieveItem: (id) => this._items[id],
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
      this._items[ref["id"]] = ref;
    }
  }

  /**
   * Parse a string and return an array of {@linkcode CiteItem}.
   *
   * The string represents a citation or group of citations, e.g. one footnote.
   * Citations are separated by semi-colons. Each citation includes an identifier
   * optionally followed by a space, a label (e.g. "p." or "chapter") and a
   * locator, i.e. "Smith1776 p. 123-124; Keynes1936 chap. 3"
   *
   * @example Usage
   * ```ts
   * import { assertEquals } from "jsr:@std/assert";
   *
   * const bibliographer = new Bibliographer();
   * const parsed = parseInput("Smith1776 p. 123-124; Keynes1936 chap. 3");
   *
   * assertEquals(
   *   parsed,
   *   [
   *     {"id": "Smith1776", "label": "page", "locator": "123-124"},
   *     {"id": "Keynes1936", "label": "chapter", "locator": "3"}
   *   ]
   * );
   * ```
   *
   * @param input String to parse.
   * @returns The parsed items.
   */
  parseInput(input: string = ""): CiteItem[] {
    const locators: Record<string, string> = {
      "bk.": "book",
      "bks.": "book",
      "chap.": "chapter",
      "chaps.": "chapter",
      "col.": "column",
      "cols.": "column",
      "fig.": "figure",
      "figs.": "figure",
      "fol.": "folio",
      "fols.": "folio",
      "no.": "issue",
      "Os.": "issue",
      "l.": "line",
      "ll.": "line",
      "n.": "note",
      "nn.": "note",
      "op.": "opus",
      "opp.": "opus",
      "p": "page",
      "p.": "page",
      "pp.": "page",
      "para.": "paragraph",
      "paras.": "paragraph",
      "¶": "paragraph",
      "¶¶": "paragraph",
      "§": "paragraph",
      "§§": "paragraph",
      "pt.": "part",
      "pts.": "part",
      "sec.": "section",
      "secs.": "section",
      "s.v.": "sub verbo",
      "s.vv.": "sub verbo",
      "v.": "verse",
      "vv.": "verse",
      "vol.": "volume",
      "vols.": "volume",
      "app.": "appendix",
      "apps.": "appendix",
      "art.": "article",
      "arts.": "article",
      "c.": "canon",
      "cc.": "canon",
      "loc.": "elocation",
      "locs.": "elocation",
      "eq.": "equation",
      "eqs.": "equation",
      "r.": "rule",
      "rr.": "rule",
      "sc.": "scene",
      "scs.": "scene",
      "supp.": "supplement",
      "supps.": "supplement",
      "tbl.": "table",
      "tbls.": "table",
      "tit.": "title",
      "tits.": "title",
    };

    const parsedInput: CiteItem[] = [];

    const items = input.split(";");
    for (const item of items) {
      if (item.trim() == "") {
        continue;
      }
      const parts = item.trim().split(" ").filter((part: string) => part != "");
      const citationItem: CiteItem = { "id": parts[0] };
      if (parts.length > 1) {
        if (parts[1] in locators) {
          citationItem.label = locators[parts[1]];
          citationItem.locator = parts[2];
        } else {
          citationItem.label = parts.slice(1, -1).join(" ");
          citationItem.locator = parts.at(-1);
        }
      }
      parsedInput.push(citationItem);
    }

    return parsedInput;
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
   * @param citation A string representing one or more citations, see {@linkcode parseInput}.
   * @throws {NoStyleLoadedError} Call {@linkcode loadStyle} before calling this function.
   * @throws {UnregisteredItemError} A cited item has not been registered by calling {@linkcode registerItems}.
   */
  addCitation(citation: string) {
    const items = this.parseInput(citation);
    this._addCitation(items);
  }

  /** @internal */
  _addCitation(items: CiteItem[]) {
    if (this._processor === undefined) {
      throw new NoStyleLoadedError();
    }
    const noteIndex = this._citations.length + 1;
    for (const item of items) {
      if (!(item.id in this._items)) {
        throw new UnregisteredItemError(item.id);
      }
    }
    const citation: citeproc.Citation = {
      citationItems: items,
      properties: { noteIndex: noteIndex },
    };
    const [_status, results] = this._processor.processCitationCluster(
      citation,
      this._citations.map((c) => [c[2], c[0]]),
      [],
    );
    for (const cited of results) {
      const [pos, formatted, id] = cited;
      this._citations[pos] = [pos + 1, formatted, id];
    }
  }

  /**
   * Reset citations, as if {@linkcode addCitation} had never been called.
   */
  clearCitations() {
    this._citations = [];
  }

  /**
   * Get array of formatted citations.
   *
   * Formats the citations previously added by calling {@linkcode addCitation}
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
   * {@linkcode addCitation}.
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
    return entries.map((entry: string) => entry.trim().replace(pattern, "$1"));
  }
}

let bibliographers: Record<string, Record<string, Bibliographer>> = {};

/**
 * Return a {@linkcode Bibliographer} instance for a style and language.
 *
 * This is an alternative to directly instantiating a Bibliographer: the
 * function keeps a cache of Bibliographer objects, and only creates a
 * new instance if needed.
 *
 * @param style Path to the CSL file to load.
 * @param lang The language to use for formatting citations.
 *   See {@linkcode Bibliographer#loadStyle}
 * @returns The requested Bibliographer object.
 */
export function getBibliographer(
  style: string,
  lang: string | undefined,
): Bibliographer {
  const language = lang ?? "_";
  if (style in bibliographers) {
    if (language in bibliographers[style]) {
      return bibliographers[style][language];
    }
  }

  const bibliographer = new Bibliographer();
  bibliographer.loadStyle(style, lang);
  const styleRealPath = realPathSync(style);
  bibliographers[styleRealPath] ??= {};
  bibliographers[styleRealPath][language] = bibliographer;
  return bibliographer;
}

/**
 * Reset the cache used by {@linkcode getBibliographer}.
 *
 * @param style If specified, only reset the instances for this style.
 */
export function resetBibliographerCache(style: string | undefined) {
  if (style !== undefined) {
    if (!path.isAbsolute(style)) {
      try {
        style = realPathSync(style);
      } catch (err) {
        if (err instanceof Error && err.name == "NotFound") {
          // ignore
          console.log(style);
        } else {
          throw err;
        }
      }
    }
    delete bibliographers[style];
  } else {
    bibliographers = {};
  }
  return true;
}
