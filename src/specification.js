import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from './modish.schema.json' with { type: 'json' };
import { suggestSimilar } from './suggestSimilar.js';

const LOCATORS = {
    'bk.': 'book',
    'bks.': 'book',
    'chap.': 'chapter',
    'chaps.': 'chapter',
    'col.': 'column',
    'cols.': 'column',
    'fig.': 'figure',
    'figs.': 'figure',
    'fol.': 'folio',
    'fols.': 'folio',
    'no.': 'number',
    'Os.': 'number',
    'l.': 'line',
    'll.': 'line',
    'n.': 'note',
    'nn.': 'note',
    'op.': 'opus',
    'opp.': 'opus',
    'p': 'page',
    'p.': 'page',
    'pp.': 'page',
    'para.': 'paragraph',
    'paras.': 'paragraph',
    '¶': 'paragraph',
    '¶¶': 'paragraph',
    '§': 'paragraph',
    '§§': 'paragraph',
    'pt.': 'part',
    'pts.': 'part',
    'sec.': 'section',
    'secs.': 'section',
    's.v.': 'sub verbo',
    's.vv.': 'sub verbo',
    'v.': 'verse',
    'vv.': 'verse',
    'vol.': 'volume',
    'vols.': 'volume',
};

export function parseInput(inputs) {
    let parsedInputs = [];
    for (let rawInput of inputs) {
        let parsedInput = [];
        let items = rawInput.split(';');
        for (let item of items) {
            let parts = item.trim().split(' ').map((part) => part.trim());
            let citationItem = { 'id': parts[0] };
            if (parts.length > 1) {
                if (parts[1] in LOCATORS) {
                    citationItem.label = LOCATORS[parts[1]];
                    citationItem.locator = parts[2];
                } else if (Object.values(LOCATORS).includes(parts[1])) {
                    citationItem.label = parts[1];
                    citationItem.locator = parts[2];
                }
            }
            parsedInput.push(citationItem);
        }
        parsedInputs.push(parsedInput);
    }
    return parsedInputs;
}

const ajv = new Ajv2020({allErrors: true});
const validate = ajv.compile(schema);

function makeOrdinal(n) {
  // we assume that n < 111
  const endings = { 1: 'st', 2: 'nd', 3: 'rd' };
  const last_digit = n % 10;
  if (last_digit in endings) {
    return n + endings[last_digit];
  }
  return n + 'th';
}

function getPropertyByPath(object, path, removeLast=true) {
  let keys = path.split('/').filter((e) => e != '#' && e != '');
  if (removeLast) {
    keys.pop();
  }
  let _object = object;
  for (const key of keys) {
    if (/[0-9]+/.test(key)) {
      _object = _object.at(Number(key));
    } else {
      _object = _object[key];
    }
  }
  return _object;
}

function pluralize(verbForm) {
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

export function validateTestSpecification(specification) {
  const valid = validate(specification);

  if (valid) {
    return [true, []];
  }

  let errorMessages = [];
  let lastArrayProperty;
  let erroneousItemsInCurrentArray = [];
  let unknownProperties = [];
  for (let error of validate.errors) {
    const propertyPath = error.instancePath.split('/').filter((e) => e !== '');

    // erroneous type
    if (error.keyword == 'type') {
      let property = propertyPath.at(-1);
      let item;
      if (/^[0-9]+$/.test(property)) {
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

      let errorDescription;
      let verb = 'is';
      let advice = '';
      if (error.params.type == 'array') {
        errorDescription = (item !== undefined) ? 'must be lists' : 'must be a list';
      } else if (error.params.type == 'string') {
        errorDescription = (item !== undefined) ? 'must be strings' : 'must be a string';
        advice = 'Did you forget to add quotation marks?';
      } else if (error.params.type == 'object') {
        // gather expected properties
        let _schema = getPropertyByPath(schema, error.schemaPath);
        let properties = Object.keys(_schema['properties']);
        let propertiesStr;
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
          Array.isArray(getPropertyByPath(specification, error.instancePath, false)) &&
            _schema['type'] != 'array'
        ) {
          if (item) {
            advice = 'It seems the';
            advice += (property == 'tests') ? ' tests' : ' entries';
            advice += ' have been erroneously written as lists.';
          } else if (property === undefined) {
            advice = 'It seems the test specification has been erroneously written as a list.';
          }
        }
      }

      if (item !== undefined) {
        // error: wrong type in array

        // same array as previously?
        let currentArrayProperty = propertyPath.slice(0, -1).join('/');
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
        let items = erroneousItemsInCurrentArray.map(makeOrdinal);
        let itemsStr;
        if (items.length > 1) {
          itemsStr = `${items.slice(0, -1).join(', ')} and ${items.at(-1)} entries`;
          verb = pluralize(verb);
        } else {
          itemsStr = `${items.at(-1)} entry`;
        }
        // "all entries in "citations" must be strings"
        // "all entries in "tests" should define properties such as…"
        let err = `all entries in "${property}"${level} ${errorDescription}, `;
        if (items.length == getPropertyByPath(specification, error.instancePath).length) {
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
      let similar = suggestSimilar(
        error.params.additionalProperty,
        Object.keys(getPropertyByPath(schema, error.schemaPath)['properties'])
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
      warning += ` and "${unknownProperties.at(-1)[0]}". `;
      let suggestions = unknownProperties.map((p) => {
        if (p[1].length === 0) {
          return '';
        }
        return `${p[1].map((pp) => `"${pp}"`).join(' or ')} instead of "${p[0]}"`;
      }).filter((sugg) => sugg !== '');
      if (suggestions.length) {
        warning += `Did you mean ${suggestions.slice(0, -1).join(', ')}`;
        warning += ` and ${suggestions.at(-1)}?`;
      }
    } else {
      let [property, suggestions] = unknownProperties[0];
      warning += `property "${property}".`;
      if (suggestions.length) {
        warning += ` Did you mean ${suggestions.map((s) => `"${s}"`).join(' or ')}?`;
      }
    }
    errorMessages.push(warning);
  }

  return [false, errorMessages];
}
