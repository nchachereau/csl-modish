import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";

import { validateTestSpecification } from '../src/specification.js';

describe('function validateTestSpecification()', () => {

  it('validates a valid test specification', () => {
    let spec = {
      style: 'minimal.csl',
      input: ['Test'],
      citations: ['Tester (2024): Test']
    };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(true);
    expect(e).toHaveLength(0);
  });

  /* Global level */

  it('reports unknown properties at the global level', () => {
    let spec = { notvalid: 'minimal.csl', also_invalid: 'de_CH' };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bunknown\b/i);
    expect(e[0]).toMatch(/\bnotvalid\b/);
    expect(e[0]).toMatch(/\balso_invalid\b/);
  });

  it('reports when a property should have been a string', () => {
    let spec = { style: { 'Journal Main Title': 'Subtitle.csl' } };
    let [v, e] = validateTestSpecification(spec);
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
    let spec = { citations: 'minimal.csl' };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\blist\b/);
    expect(e[0]).toMatch(/\bcitations\b/);
    // should not mention level when there is no possible confusion
    expect(e[0]).not.toMatch(/at the global level/);
  });

  it('gives precisions when there is a possible confusion', () => {
    let spec = {
      style: [ { mystyle: 'minimal.csl' } ],
      tests: [
        { style: 'other.csl' }
      ]
    };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bstring\b/);
    expect(e[0]).toMatch(/at the global level/);
  })

  it('reports when the specification is not an object', () => {
    let spec = [
      { style: { 'Journal Main Title': 'Subtitle.csl' } },
      { citations: [ 'Citation1' ] },
      { bibliography: [ 'Bibliography' ] }
    ];
    let [v, e] = validateTestSpecification(spec);
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
    let spec = { citations: [ { author: 'title' }, 'xxx' ] };
    let [v, e] = validateTestSpecification(spec);
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
    let spec = { citations: [
      { author: 'title' },
      { author2: 'title2' }
    ] };
    let [v, e] = validateTestSpecification(spec);
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
    let spec = { tests: [ { notvalid: 'xxx' } ] };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/notvalid/);
  });

  it('reports when a property inside a test should have been a string', () => {
    let spec = { tests: [
      { },
      { style: [ 'minimal.csl', 'other.csl' ] }
    ] };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bstyle\b/);
    expect(e[0]).toMatch(/the 2nd test/);
    expect(e[0]).toMatch(/\bstring\b/);
  });

  it('reports when a property inside a test should have been an array', () => {
    let spec = { tests: [
      { },
      { },
      { citations: 'xxx' }
    ] };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\bcitations\b/);
    expect(e[0]).toMatch(/the 3rd test/);
    expect(e[0]).toMatch(/\blist\b/);
  });

  it('reports when a test is not an object', () => {
    let spec = {
      tests: [ [ { citations: [ 'Citation1', 'Citation2' ] } ] ]
    };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/\btests\b/i);
    // mention specific expected properties
    expect(e[0]).toMatch(/style/);
    expect(e[0]).toMatch(/input/);
    expect(e[0]).toMatch(/citations/);
  });

  /* Both global and in tests */
  it('reports all errors', () => {
    let spec = {
      styl: 'minimal.csl',
      input: 'Key1, Key2',
      tests: [
        'Biblio1',
        { bibliography: [ 'Biblio2' ] }
      ]
    };
    let [v, e] = validateTestSpecification(spec);
    expect(v).toBe(false);
    expect(e).toHaveLength(3);
    expect(e[0]).toMatch(/input/);
    expect(e[0]).toMatch(/\blist\b/);
    expect(e[1]).toMatch(/\btests\b/);
    expect(e[1]).toMatch(/1st/);
    expect(e[2]).toMatch(/\bstyl\b/);
  })

});
