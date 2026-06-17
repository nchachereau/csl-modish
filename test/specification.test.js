import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import {
  assertSpyCall,
  assertSpyCalls,
  returnsNext,
  spy,
  stub,
} from "jsr:@std/testing/mock";
import { expect } from "jsr:@std/expect";

import { TestSpecification } from "../src/specification.ts";
import {
  Bibliographer,
  resetBibliographerCache,
  UnregisteredItemError,
} from "../src/bibliographer.ts";

describe("TestSpecification validation", () => {
  it("validates a valid test specification", () => {
    const spec = {
      style: "minimal.csl",
      input: ["Test"],
      citations: ["Tester (2024): Test"],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    expect(ts.valid).toBe(true);
    expect(ts.errors).toHaveLength(0);
  });

  /* Global level */

  it("reports unknown properties at the global level", () => {
    const spec = { notvalid: "minimal.csl", also_invalid: "de_CH" };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bunknown\b/i);
    expect(e[0]).toMatch(/\bnotvalid\b/);
    expect(e[0]).toMatch(/\balso_invalid\b/);
    // no suggestions
    expect(e[0]).not.toMatch(/Did you mean/);
  });

  it("suggests corrections to misspellings", () => {
    const spec = { styl: "minimal.csl", alng: "de_CH" };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bunknown\b/i);
    expect(e[0]).toMatch(/\bstyl\b/);
    expect(e[0]).toMatch(/\bstyle\b/);
    expect(e[0]).toMatch(/\balng\b/);
    expect(e[0]).toMatch(/\blang\b/);
  });

  it("reports when a property should have been a string", () => {
    const spec = { style: { "Journal Main Title": "Subtitle.csl" } };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    // mentions property
    expect(e[0]).toMatch(/\bstyle\b/);
    // mentions expected type
    expect(e[0]).toMatch(/\bstring\b/);
    // mentions a possible solution (quote(s), quoting, etc.)
    expect(e[0]).toMatch(/\bquot/);
  });

  it("reports when a property should have been an array", () => {
    const spec = { citations: "minimal.csl" };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\blist\b/);
    expect(e[0]).toMatch(/\bcitations\b/);
    // should not mention level when there is no possible confusion
    expect(e[0]).not.toMatch(/at the global level/);
  });

  it("gives precisions when there is a possible confusion", () => {
    const spec = {
      style: [{ mystyle: "minimal.csl" }],
      tests: [
        { style: "other.csl" },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bstring\b/);
    expect(e[0]).toMatch(/at the global level/);
  });

  it("reports when the specification is not an object", () => {
    const spec = [
      { style: { "Journal Main Title": "Subtitle.csl" } },
      { citations: ["Citation1"] },
      { bibliography: ["Bibliography"] },
    ];
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\btest file\b/i);
    // mentions specific expected properties
    expect(e[0]).toMatch(/style/);
    expect(e[0]).toMatch(/input/);
    expect(e[0]).toMatch(/citations/);
    // mentions the problem
    expect(e[0]).toMatch(/\blist\b/);
  });

  it("reports an invalid value in an array", () => {
    const spec = { citations: [{ author: "title" }, "xxx"] };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    // mentions the property
    expect(e[0]).toMatch(/\bcitations\b/);
    // mentions the position in the list
    expect(e[0]).toMatch(/\b1st\b/);
    // mentions the expected type
    expect(e[0]).toMatch(/\bstrings\b/);
  });

  it("reports when no value is valid in an array", () => {
    const spec = {
      citations: [
        { author: "title" },
        { author2: "title2" },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    // mentions the property
    expect(e[0]).toMatch(/\bcitations\b/);
    // mentions the expected type
    expect(e[0]).toMatch(/\bstrings\b/);
    // does not mention the positions
    expect(e[0]).not.toMatch(/\b1st\b/);
    expect(e[0]).not.toMatch(/\b2nd\b/);
  });

  /* Inside tests array */

  it("reports unknown properties in test suite", () => {
    const spec = { tests: [{ notvalid: "xxx" }] };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/notvalid/);
  });

  it("reports when a property inside a test should have been a string", () => {
    const spec = {
      tests: [
        {},
        { style: ["minimal.csl", "other.csl"] },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bstyle\b/);
    expect(e[0]).toMatch(/the 2nd test/);
    expect(e[0]).toMatch(/\bstring\b/);
  });

  it("reports when a property inside a test should have been an array", () => {
    const spec = {
      tests: [
        {},
        {},
        { citations: "xxx" },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bcitations\b/);
    expect(e[0]).toMatch(/the 3rd test/);
    expect(e[0]).toMatch(/\blist\b/);
  });

  it("reports when a test is not an object", () => {
    const spec = {
      tests: [[{ citations: ["Citation1", "Citation2"] }]],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\btests\b/i);
    // mention specific expected properties
    expect(e[0]).toMatch(/style/);
    expect(e[0]).toMatch(/input/);
    expect(e[0]).toMatch(/citations/);
  });

  it("reports when an array item in a test should have been a string", () => {
    const spec = {
      style: "minimal.csl",
      tests: [
        { lang: "de_CH", citations: [{ Author: "Title" }] },
        { lang: "fr_FR", citations: ["Correct", "Correct"] },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e).toMatch(/1st test/);
  });

  /* Both global and in tests */
  it("reports all errors", () => {
    const spec = {
      styl: "minimal.csl",
      input: "Key1, Key2",
      tests: [
        "Biblio1",
        { bibliography: ["Biblio2"] },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(3);
    expect(e[0]).toMatch(/input/);
    expect(e[0]).toMatch(/\blist\b/);
    expect(e[1]).toMatch(/\btests\b/);
    expect(e[1]).toMatch(/1st/);
    expect(e[2]).toMatch(/\bstyl\b/);
  });
});

describe("styles property", () => {
  it("is empty when the spec is invalid", () => {
    const spec = { style: "minimal.csl", invalid: "de_CH" };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    expect(ts.styles).toMatchObject([]);
  });

  it("returns the global style", () => {
    const spec = {
      style: "minimal.csl",
      input: ["Test"],
      citations: ["Tester (2024): Test"],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    expect(ts.styles).toMatchObject(["minimal.csl"]);
  });

  it("returns the styles used in the specific tests", () => {
    const spec = {
      style: "global.csl",
      tests: [
        {
          input: ["Test"],
          citations: ["Tester (2024): Test"],
          style: "style1.csl",
        },
        {
          input: ["Test"],
          citations: ["Tester (2024): Test"],
          style: "style2.csl",
        },
      ],
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    expect(ts.styles).toMatchObject(["style1.csl", "style2.csl"]);
  });
});

describe("runTests()", () => {
  beforeEach(() => {
    resetBibliographerCache();
  });

  it("registers items to cite", () => {
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
    ];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const bibliographerRegisterItemsSpy = spy(
      Bibliographer.prototype,
      "registerItems",
    );
    const _spec = { input: [], style: "test/minimal.csl" };

    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      spec.runTests(items);
    } finally {
      bibliographerLoadStyleStub.restore();
    }
    assertSpyCall(bibliographerRegisterItemsSpy, 0, {
      args: [items],
    });
  });

  it("informs that all citations matched their expected output", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2024a.", "Smith 2024b."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024a.", "Smith 2024b."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      citations: citations,
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }

    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
    assertSpyCall(citeStub, 0, { args: ["Book1"] });
    assertSpyCall(citeStub, 1, { args: ["Book2"] });
    assertSpyCalls(citeStub, 2);
    assertSpyCalls(getCitationsStub, 1);
  });

  it("reports citations not matching their expected output", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2012.", "Smith 2015."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2012.", "Doe 1995."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      citations: citations,
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }
    expect(results).toMatchObject([false]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toHaveLength(1);
    expect(failures[0][0]).toMatchObject({
      type: "citation",
      expected: "Smith 2015.",
      actual: "Doe 1995.",
    });
  });

  it("reports that the bibliography matches the expected output", () => {
    const input = ["Book1", "Book2"];
    const bibliography = ["Jane Doe, Book2, 1990", "John Smith, Book1, 2024."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024.", "Doe 1990."],
      ]),
    );
    const getBibliographyStub = stub(
      Bibliographer.prototype,
      "getBibliography",
      returnsNext([
        ["Jane Doe, Book2, 1990", "John Smith, Book1, 2024."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      bibliography: bibliography,
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
      getBibliographyStub.restore();
    }
    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
  });

  it("reports bibliography not matching expected output", () => {
    const input = ["Book1", "Book2"];
    const bibliography = ["Jane Doe, Book2, 1990.", "John Smith, Book1, 2024."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024.", "Doe 1990."],
      ]),
    );
    const getBibliographyStub = stub(
      Bibliographer.prototype,
      "getBibliography",
      returnsNext([
        ["Wrong Name, Other Book, 1990.", "John Smith, Book1, 2024."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      bibliography: bibliography,
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
      getBibliographyStub.restore();
    }
    expect(results).toMatchObject([false]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toHaveLength(1);
    expect(failures[0][0]).toMatchObject({
      type: "bibliography",
      expected: "- Jane Doe, Book2, 1990.\n- John Smith, Book1, 2024.",
      actual: "- Wrong Name, Other Book, 1990.\n- John Smith, Book1, 2024.",
    });
  });

  it("reports failure if no inputs are specified", () => {
    const citations = ["Smith 2024.", "Doe 1990."];
    const _spec = { style: "test/minimal.csl", citations: citations };

    const spec = new TestSpecification();
    spec.loadFromObject(_spec);
    const [results, failures, names] = spec.runTests([]);

    expect(results).toMatchObject([false]);
    expect(failures[0][0].type).toEqual("error");
    expect(failures[0][0].error).toMatch(/\binput\b/);
  });

  it("reports failure if neither citation nor bibliography are specified", () => {
    const input = ["Book1", "Book2"];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024.", "Doe 1990."],
      ]),
    );
    const getBibliographyStub = stub(
      Bibliographer.prototype,
      "getBibliography",
      returnsNext([
        ["Jane Doe, Book2, 1990", "John Smith, Book1, 2024."],
      ]),
    );
    const _spec = { style: "test/minimal.csl", input: input };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
      getBibliographyStub.restore();
    }
    expect(results).toMatchObject([false]);
    expect(failures[0][0]).toMatchObject({
      type: "error",
      error:
        "Please specify expected output (citations and/or bibliography) in your test(s).",
    });
  });

  it("loads the style specified in the specification", () => {
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const input = [];
    const _spec = { input: input, style: "test/minimal.csl" };
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
    }
    assertSpyCall(bibliographerLoadStyleStub, 0, {
      args: ["test/minimal.csl", undefined],
    });
  });

  it("uses the language specified in the test", () => {
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const input = [];
    const _spec = { input: input, style: "test/minimal.csl", lang: "de-CH" };
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
    }
    assertSpyCall(bibliographerLoadStyleStub, 0, {
      args: ["test/minimal.csl", "de-CH"],
    });
  });

  it("reports a failure when style file does not exist", () => {
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([]),
    );
    const _spec = {
      style: "xtestz.csl",
      input: ["Book1"],
      citations: ["Smith 2012."],
    };
    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      citeStub.restore();
    }
    expect(results).toMatchObject([false]);
    expect(failures[0][0]).toHaveProperty("error");
    assertSpyCalls(citeStub, 0);
  });

  it("reports a failure when identifier not found in references", () => {
    const input = ["Book1"];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([new UnregisteredItemError(input[0])]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      citations: ["Smith 2012."],
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
    }
    expect(results).toMatchObject([false]);
    expect(failures[0][0]).toHaveProperty("error");
    expect(failures[0][0].error).toEqual(expect.stringContaining(input[0]));
  });

  it("supports series of tests", () => {
    const localInput1 = ["Book1", "Book2"];
    const localInput2 = ["Book3"];
    const globalInput = ["Wrong1"];
    const citations1 = ["Smith 2012.", "Smith 2015."];
    const citations2 = ["Doe 1995."]
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true, true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], [], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2012.", "Doe 1995."],
        ["Doe 1995."]
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: globalInput,
      tests: [
        { input: localInput1, citations: citations1 },
        { input: localInput2, citations: citations2 },
      ],
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }
    expect(results).toMatchObject([false, true]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toHaveLength(1);
    expect(failures[0][0]).toMatchObject({
      type: "citation",
      expected: "Smith 2015.",
      actual: "Doe 1995.",
    });
    assertSpyCall(citeStub, 0, { args: ["Book1"] });
    assertSpyCall(citeStub, 1, { args: ["Book2"] });
    assertSpyCall(citeStub, 2, { args: ["Book3"] });
  });

  it("uses style defined in test case", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2012.", "Smith 2015."];
    const styleName = "test/minimal.csl";
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        citations,
      ]),
    );
    const _spec = {
      tests: [{ style: styleName, input: input, citations: citations }],
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }
    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
    assertSpyCall(bibliographerLoadStyleStub, 0, {
      args: [styleName, undefined],
    });
  });

  it("can use input defined globally", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2012.", "Smith 2015."];
    const styleName = "test/minimal.csl";
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        citations,
      ]),
    );
    const _spec = {
      input: input,
      tests: [
        { style: styleName, citations: citations },
      ],
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }
    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
    assertSpyCall(citeStub, 0, { args: ["Book1"] });
    assertSpyCall(citeStub, 1, { args: ["Book2"] });
  });

  it("should not use global expected outputs if input is defined in test case", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2024.", "Doe 1990."];
    const bibliography = ["Jane Doe, Book2, 1990.", "John Smith, Book1, 2024."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        citations,
      ]),
    );
    const getBibliographyStub = stub(
      Bibliographer.prototype,
      "getBibliography",
      returnsNext([
        ["Wrong Name, Other Book, 1990.", "John Smith, Book1, 2024."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      bibliography: bibliography,
      tests: [{ input: input, citations: citations }],
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
      getBibliographyStub.restore();
    }
    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
  });

  it("stops after first failure when asked to do so", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2012.", "Smith 2015."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Doe 2012."],
        ["Doe 1995."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      tests: [
        { input: [input[0]], citations: [citations[0]] },
        { input: [input[1]], citations: [citations[1]] },
      ]
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      // pass bail=true
      [results, failures, names] = spec.runTests([], true);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }
    expect(results).toMatchObject([false]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toHaveLength(1);
    expect(failures[0][0]).toMatchObject({
      type: "citation",
      expected: "Smith 2012.",
      actual: "Doe 2012.",
    });
  });

  it("preserves test names in results", () => {
    const _spec = {
      style: "test/minimal.csl",
      input: ["Book1"],
      citations: ["Smith 2024."],
      name: "Global test with name",
    };
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024."],
      ]),
    );

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }

    expect(names).toHaveLength(1);
    expect(names[0]).toBe("Global test with name");
    expect(results).toMatchObject([true]);
  });

  it("handles unnamed tests in results", () => {
    const _spec = {
      style: "test/minimal.csl",
      input: ["Book1"],
      citations: ["Smith 2024."],
    };
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024."],
      ]),
    );

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }

    expect(names).toHaveLength(1);
    expect(names[0]).toBe("");
    expect(results).toMatchObject([true]);
  });

  it("preserves test names in test array", () => {
    const _spec = {
      style: "test/minimal.csl",
      tests: [
        { input: ["Book1"], citations: ["Smith 2024."], name: "First named test" },
        { input: ["Book1"], citations: ["Smith 2024."] },
        { input: ["Book1"], citations: ["Smith 2024."], name: "Third named test" },
      ],
    };
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true, true, true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], [], [], [], [], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith 2024."],
        ["Smith 2024."],
        ["Smith 2024."],
      ]),
    );

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([]);
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
    }

    expect(names).toHaveLength(3);
    expect(names[0]).toBe("First named test");
    expect(names[1]).toBe("");
    expect(names[2]).toBe("Third named test");
    expect(results).toMatchObject([true, true, true]);
  });

  it("skips bibliography check when asked to only check citations", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2024a.", "Smith 2024b."];
    const bibliography = ["Jane Doe, Book2, 1990.", "John Smith, Book1, 2024."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        citations,
      ]),
    );
    const getBibliographyStub = stub(
      Bibliographer.prototype,
      "getBibliography",
      returnsNext([
        ["John Doe, Book99, 1990.", "John Doe, Book100, 2024."],
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      citations: citations,
      bibliography: bibliography,
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([], false, "citations");
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
      getBibliographyStub.restore();
    }
    // expect test to pass in spite of bad bibliography
    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
    assertSpyCalls(getCitationsStub, 1);
    assertSpyCalls(getBibliographyStub, 0);
  });

  it("skips citations check when asked to only check bibliography", () => {
    const input = ["Book1", "Book2"];
    const citations = ["Smith 2024a.", "Smith 2024b."];
    const bibliography = ["Jane Doe, Book2, 1990.", "John Smith, Book1, 2024."];
    const bibliographerLoadStyleStub = stub(
      Bibliographer.prototype,
      "loadStyle",
      returnsNext([true]),
    );
    const citeStub = stub(
      Bibliographer.prototype,
      "addCitation",
      returnsNext([[], []]),
    );
    const getCitationsStub = stub(
      Bibliographer.prototype,
      "getCitations",
      returnsNext([
        ["Smith (2024a)", "Smith (2024b)"],
      ]),
    );
    const getBibliographyStub = stub(
      Bibliographer.prototype,
      "getBibliography",
      returnsNext([
        bibliography,
      ]),
    );
    const _spec = {
      style: "test/minimal.csl",
      input: input,
      citations: citations,
      bibliography: bibliography,
    };

    let results, failures, names;
    try {
      const spec = new TestSpecification();
      spec.loadFromObject(_spec);
      [results, failures, names] = spec.runTests([], false, "bibliography");
    } finally {
      bibliographerLoadStyleStub.restore();
      citeStub.restore();
      getCitationsStub.restore();
      getBibliographyStub.restore();
    }
    // expect test to pass in spite of bad citations
    expect(results).toMatchObject([true]);
    expect(failures).toHaveLength(0);
    assertSpyCalls(getBibliographyStub, 1);
  });

});
