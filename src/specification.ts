import { Ajv2020, type DefinedError } from 'ajv/dist/2020.js';
import schema from './modish.schema.json' with { type: 'json' };
import { suggestSimilar } from './suggestSimilar.ts';

/** One test specification. */
export interface SingleTestSpecification {
  /** Path to the CSL file to test. */
  style?: string;
  /** Locale to use for this test. */
  lang?: string;
  /** The citations to add during the test. */
  input?: string[];
  /** The expected formatted citations. */
  citations?: string[];
  /** The expected formatted bibliography. */
  bibliography?: string[];
};

/** One or more specified tests. */
export interface TestSpecification extends SingleTestSpecification {
  /** An array of tests to run. */
  tests?: SingleTestSpecification[];
}

function makeOrdinal(n: number): string {
  // we assume that n < 111
  const endings: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  const last_digit = n % 10;
  if (last_digit in endings) {
    return n + endings[last_digit];
  }
  return n + 'th';
}

function getPropertyByPath(object: Record<string, unknown>, path: string, removeLast?: boolean): unknown;
function getPropertyByPath(object: Array<unknown>, path: string, removeLast?: boolean): unknown;
function getPropertyByPath(object: Record<string, unknown> | Array<unknown>, path: string, removeLast=true) {
  const keys = path.split('/').filter((e) => e != '#' && e != '');
  if (removeLast) {
    keys.pop();
  }
  let _object: unknown = object;
  for (const key of keys) {
    if (_object && typeof _object == 'object') {
      _object = _object[key as keyof typeof _object];
    }
  }
  return _object;
}

function pluralize(verbForm: string) {
  if (verbForm == 'is') {
    return 'are';
  } else if (verbForm == 'does') {
    return 'do';
  } else if (verbForm.at(-1) == 's') {
    return verbForm.slice(0, -1);
  } else {
    return verbForm;
  }
}

const ajv = new Ajv2020({allErrors: true});
const validate = ajv.compile(schema);

/**
 * Check that the passed object is a valid test specification.
 *
 * @param specification The object to validate.
 * @returns An array containing:
 *   1) true or false to indicate whether the object is a valid test specification;
 *   2) if false, an array of messages detailling the errors.
 */
export function validateTestSpecification(specification: object): [boolean, string[]] {
  const valid = validate(specification);

  // The validation of the object is simply done by using a JSON schema
  // and the Ajv library, a JSON schema validator
  if (valid) {
    return [true, []];
  }

  // Most of the code in this function is about transforming the errors reported
  // by Ajv into messages useful to the user

  const errorMessages: string[] = [];
  let lastArrayProperty: string = '';
  let erroneousItemsInCurrentArray: number[] = [];
  const unknownProperties: [string, string[]][] = [];
  for (const error of validate.errors as DefinedError[]) {
    const propertyPath = error.instancePath.split('/').filter((e: string) => e !== '');

    // erroneous type
    if (error.keyword == 'type') {
      let property = propertyPath.at(-1);
      let item: number = -1;
      if (property !== undefined && /^[0-9]+$/.test(property)) {
        property = propertyPath.at(-2);
        item = Number(propertyPath.at(-1)) + 1;
      }

      // only report 'global level' if there is also a 'tests' level
      let level = '';
      if (propertyPath.length == 1 && 'tests' in specification) {
        level = ' at the global level';
      } else if (propertyPath[0] == 'tests') {
        const n = Number(propertyPath[1]) + 1;
        const ord = makeOrdinal(n);
        level = ` in the ${ord} test`;
      }

      let errorDescription: string = '';
      let verb = 'is';
      let advice = '';
      if (error.params.type == 'array') {
        errorDescription = (item !== -1) ? 'must be lists' : 'must be a list';
      } else if (error.params.type == 'string') {
        errorDescription = (item !== -1) ? 'must be strings' : 'must be a string';
        advice = 'Did you forget to add quotation marks?';
      } else if (error.params.type == 'object') {
        // gather properties of expected object
        const objectSchema = getPropertyByPath(schema, error.schemaPath) as object;
        const properties = Object.keys(objectSchema['properties' as keyof typeof objectSchema]);
        let propertiesStr: string;
        if (properties.length < 3) {
          propertiesStr = properties.map((p) => `"${p}"`).join(' and ');
        } else {
          propertiesStr = properties.slice(0, -1).map((p) => `"${p}"`).join(', ');
          propertiesStr += ` and "${properties.at(-1)}"`;
        }
        errorDescription = `should define properties such as ${propertiesStr}`;
        verb = 'does';
        // give advice when array instead of object
        if (
          Array.isArray(getPropertyByPath(specification, error.instancePath, false))
        ) {
          if (item !== -1) {
            advice = 'It seems the';
            advice += (property == 'tests') ? ' tests' : ' entries';
            advice += ' have been erroneously written as lists.';
          } else if (property === undefined) {
            advice = 'It seems the test specification has been erroneously written as a list.';
          }
        }
      }

      if (item !== -1) {
        // error: wrong type in array

        // same array as previously?
        const currentArrayProperty = propertyPath.slice(0, -1).join('/');
        if (lastArrayProperty == currentArrayProperty) {
          erroneousItemsInCurrentArray.push(item);
          // same array, remove last message before pushing the updated message
          errorMessages.pop();
        } else {
          // new array, reset list of erroneous items
          erroneousItemsInCurrentArray = [item];
        }
        lastArrayProperty = currentArrayProperty;

        // prepare message
        const items = erroneousItemsInCurrentArray.map(makeOrdinal);
        let itemsStr: string;
        if (items.length > 1) {
          itemsStr = `${items.slice(0, -1).join(', ')} and ${items.at(-1)} entries`;
          verb = pluralize(verb);
        } else {
          itemsStr = `${items.at(-1)} entry`;
        }
        // "all entries in "citations" must be strings"
        // "all entries in "tests" should define properties such as…"
        let err = `all entries in "${property}"${level} ${errorDescription}, `;
        const arr = getPropertyByPath(specification, error.instancePath) as object[] | string[];
        if (items.length == arr.length) {
          err += `but none ${pluralize(verb)}. ${advice}`;
        } else {
          err += `but the ${itemsStr} ${verb} not. ${advice}`;
        }
        errorMessages.push(err);
      } else if (property !== undefined) {
        // '"style" must be a string. Did you forget to add quotation marks?'
        // '"citations"' in the 2nd test must be a list. '
        errorMessages.push(`"${property}"${level} ${errorDescription}. ${advice}`);
      } else {
        // 'the test file should define properties such as…''
        errorMessages.push(`the test file ${errorDescription}. ${advice}`);
      }
    // unknown properties
    } else if (error.keyword == 'additionalProperties') {
      const similar = suggestSimilar(
        error.params.additionalProperty,
        Object.keys(schema['properties'])
      )
      unknownProperties.push([
        error.params.additionalProperty,
        similar
      ]);
    }
  }
  // warnings about unknown properties
  if (unknownProperties.length) {
    let warning = 'found unknown ';
    if (unknownProperties.length > 1) {
      warning += 'properties ';
      warning += unknownProperties.slice(0, -1).map((p) => `"${p[0]}"`).join(', ');
      warning += ` and "${unknownProperties.at(-1)?.[0]}". `;
      const suggestions = unknownProperties.map((p) => {
        if (p[1].length === 0) {
          return '';
        }
        return `${p[1].map((pp: string) => `"${pp}"`).join(' or ')} instead of "${p[0]}"`;
      }).filter((sugg) => sugg !== '');
      if (suggestions.length) {
        warning += `Did you mean ${suggestions.slice(0, -1).join(', ')}`;
        warning += ` and ${suggestions.at(-1)}?`;
      }
    } else {
      const [property, suggestions] = unknownProperties[0];
      warning += `property "${property}".`;
      if (suggestions.length) {
        warning += ` Did you mean ${suggestions.map((s: string) => `"${s}"`).join(' or ')}?`;
      }
    }
    errorMessages.push(warning);
  }

  return [false, errorMessages];
}
