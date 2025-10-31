import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import * as path from "jsr:@std/path";

import {
  Bibliographer,
  UnloadableStyleError,
  NoStyleLoadedError,
  UnregisteredItemError,
  StyleProcessingError,
} from "../src/bibliographer.ts";

const style = path.join(import.meta.dirname, "minimal.csl");

const items = [
  {
    "id": "Book1",
    "type": "book",
    "author": [{ "family": "Smith", "given": "John" }],
    "title": "Book1",
    "issued": { "date-parts": [[2024, 1, 1]] },
  },
  {
    "id": "Book2",
    "type": "book",
    "author": [{ "family": "Smith", "given": "William" }],
    "title": "Book2",
    "issued": { "date-parts": [[2024, 1, 1]] },
  },
  {
    "id": "Article1",
    "type": "article-journal",
    "author": [{ "family": "Doe", "given": "Jane" }],
    "title": "Article1",
    "issued": { "date-parts": [[1990, 12, 31]] },
  },
];

describe("Bibliographer", () => {
  let bibliographer;
  beforeEach(() => {
    bibliographer = new Bibliographer();
    bibliographer.loadStyle(style);
    bibliographer.registerItems(items);
  });

  it("returns formatted citations", () => {
    bibliographer._addCitation([{ id: "Book1" }, { id: "Article1" }]);
    bibliographer._addCitation([{ id: "Book2" }]);
    const citations = bibliographer.getCitations();
    expect(citations).toMatchObject([
      "Smith 2024a; Doe 1990.",
      "Smith 2024b.",
    ]);
  });

  it("formats subsequent citations", () => {
    bibliographer._addCitation([{ id: "Book1" }]);
    bibliographer._addCitation([{ id: "Book1" }]);
    const citations = bibliographer.getCitations();
    expect(citations[1]).toEqual("ibid.");
  });

  it("formats a citation with a locator", () => {
    bibliographer._addCitation([{
      id: "Book1",
      label: "page",
      locator: "102-103",
    }]);
    const citations = bibliographer.getCitations();
    expect(citations[0]).toEqual("Smith 2024 pp. 102–103.");
  });

  it("formats a citation with an unknown locator", () => {
    bibliographer._addCitation([{
      id: "Book1",
      label: "gibberish",
      locator: "2",
    }]);
    const citations = bibliographer.getCitations();
    expect(citations[0]).toEqual("Smith 2024 2.");
  });

  it("throws an error when item does not exist", () => {
    expect(() => bibliographer._addCitation([{ id: "NoSuchBook" }])).toThrow(
      UnregisteredItemError,
    );
  });

  it("supports defining the locale", () => {
    bibliographer = new Bibliographer();
    bibliographer.loadStyle(style, "de-DE");
    bibliographer.registerItems(items);
    bibliographer._addCitation([{ id: "Book1" }]);
    bibliographer._addCitation([{ id: "Book1" }]);
    const citations = bibliographer.getCitations();
    expect(citations[1]).toEqual("ebd.");
  });

  it("throws a specific error when it cannot load the style", () => {
    bibliographer = new Bibliographer();
    expect(() => bibliographer.loadStyle(
      path.join(import.meta.dirname, "ill-formed.csl")
    )).toThrow(
      UnloadableStyleError
    );
  });

  it("formats a bibliography with cited items", () => {
    bibliographer._addCitation([{ id: "Book1" }, { id: "Book2" }, {
      id: "Article1",
    }]);
    const bibliography = bibliographer.getBibliography();
    expect(bibliography).toMatchObject([
      "John Smith, <i>Book1</i>, 2024a.",
      "William Smith, <i>Book2</i>, 2024b.",
      "Jane Doe, Article1, 1990.",
    ]);
  });

  it("throws an error when style has not been loaded", () => {
    bibliographer = new Bibliographer();
    bibliographer.registerItems(items);
    expect(() => bibliographer._addCitation([{ id: "Book1" }])).toThrow(
      NoStyleLoadedError,
    );

    bibliographer = new Bibliographer();
    bibliographer.registerItems(items);
    expect(() => bibliographer.getBibliography()).toThrow(NoStyleLoadedError);
  });

  it("throws a specific error when the style is invalid", () => {
    bibliographer = new Bibliographer();
    bibliographer.loadStyle(path.join(import.meta.dirname, "invalid.csl"));
    bibliographer.registerItems(items);
    expect(() => bibliographer._addCitation([{ id: "Book1" }])).toThrow(
      StyleProcessingError,
    );
  });

  it("parses citations with locators", () => {
    const inputs = bibliographer.parseInput("Book1 p. 103; Book2 pp. 28-35");
    expect(inputs).toMatchObject([
      { id: "Book1", label: "page", locator: "103" },
      { id: "Book2", label: "page", locator: "28-35" },
    ]);
  });

  it("can parse locators other than page", () => {
    const inputs = bibliographer.parseInput(
      "Book1 fig. 1; Book2 chapter 2; Article § 10",
    );
    expect(inputs).toMatchObject([
      { id: "Book1", label: "figure", locator: "1" },
      { id: "Book2", label: "chapter", locator: "2" },
      { id: "Article", label: "paragraph", locator: "10" },
    ]);
  });
});
