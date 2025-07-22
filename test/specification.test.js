import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";

import { TestSpecification } from '../src/specification.ts';

describe('TestSpecification validation', () => {

  it('validates a valid test specification', () => {
    const spec = {
      style: 'minimal.csl',
      input: ['Test'],
      citations: ['Tester (2024): Test']
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    expect(ts.valid).toBe(true);
    expect(ts.errors).toHaveLength(0);
  });

  /* Global level */

  it('reports unknown properties at the global level', () => {
    const spec = { notvalid: 'minimal.csl', also_invalid: 'de_CH' };
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

  it('suggests corrections to misspellings', () => {
    const spec = { styl: 'minimal.csl', alng: 'de_CH' };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bunknown\b/i);
    expect(e[0]).toMatch(/\bstyl\b/);
    expect(e[0]).toMatch(/\bstyle\b/);
  });

  it('reports when a property should have been a string', () => {
    const spec = { style: { 'Journal Main Title': 'Subtitle.csl' } };
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

  it('reports when a property should have been an array', () => {
    const spec = { citations: 'minimal.csl' };
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

  it('gives precisions when there is a possible confusion', () => {
    const spec = {
      style: [ { mystyle: 'minimal.csl' } ],
      tests: [
        { style: 'other.csl' }
      ]
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bstring\b/);
    expect(e[0]).toMatch(/at the global level/);
  })

  it('reports when the specification is not an object', () => {
    const spec = [
      { style: { 'Journal Main Title': 'Subtitle.csl' } },
      { citations: [ 'Citation1' ] },
      { bibliography: [ 'Bibliography' ] }
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

  it('reports an invalid value in an array', () => {
    const spec = { citations: [ { author: 'title' }, 'xxx' ] };
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

  it('reports when no value is valid in an array', () => {
    const spec = { citations: [
      { author: 'title' },
      { author2: 'title2' }
    ] };
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

  it('reports unknown properties in test suite', () => {
    const spec = { tests: [ { notvalid: 'xxx' } ] };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/notvalid/);
  });

  it('reports when a property inside a test should have been a string', () => {
    const spec = { tests: [
      { },
      { style: [ 'minimal.csl', 'other.csl' ] }
    ] };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bstyle\b/);
    expect(e[0]).toMatch(/the 2nd test/);
    expect(e[0]).toMatch(/\bstring\b/);
  });

  it('reports when a property inside a test should have been an array', () => {
    const spec = { tests: [
      { },
      { },
      { citations: 'xxx' }
    ] };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bcitations\b/);
    expect(e[0]).toMatch(/the 3rd test/);
    expect(e[0]).toMatch(/\blist\b/);
  });

  it('reports when a test is not an object', () => {
    const spec = {
      tests: [ [ { citations: [ 'Citation1', 'Citation2' ] } ] ]
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

  it('reports when an array item in a test should have been a string', () => {
    const spec = {
      style: 'minimal.csl',
      tests: [
        { lang: 'de_CH', citations: [ { Author: 'Title' } ] },
        { lang: 'fr_FR', citations: [ 'Correct', 'Correct' ] }
      ]
    };
    const ts = new TestSpecification();
    ts.loadFromObject(spec);
    const [v, e] = [ts.valid, ts.errors];
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e).toMatch(/1st test/);
  });

  /* Both global and in tests */
  it('reports all errors', () => {
    const spec = {
      styl: 'minimal.csl',
      input: 'Key1, Key2',
      tests: [
        'Biblio1',
        { bibliography: [ 'Biblio2' ] }
      ]
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
  })

});
