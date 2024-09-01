<div align="center">

# Modish

Modish runs easy-to-write tests to check the output of a CSL bibliographic
style.

</div>

- The [Citation Style Language](https://citationstyles.org/) makes it possible to
  write bibliographic styles that automate the formatting of citations and
  bibliographies.
- Modish helps making sure that the citations and bibliographies formatted by a
  CSL style match the guidelines it implements.


## Installation

(tbd)

## Getting started

- Create a directory named `test` in your CSL project.

- Add a `references.json` file to the `test` directory, in
  [CSL-JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html)
  format. Easiest way: export relevant references from your Zotero library.

- Edit `test/books.yml` (name the test however you want).

  Here is what a minimal test file could look like:

  ```yaml
  style: src/apa.csl

  input:
    - Thompson1991 p. 128
    - Mills1959

  citations:
    - (Thompson, 1963/1991, p. 128)
    - (Mills, 1956/1959)

  bibliography:
    - Mills, C. W. (1959). <i>The power elite</i>. Oxford University Press. (Original work published 1956)
    - Thompson, E. P. (1991). <i>The Making of the English working class</i>. Penguin Books. (Original work published 1963)
  ```

  The first line (`style`) states the path of the CSL file to be tested; 
  `input` gives, as a list, the references to be cited, using the `id` specified
  in the `references.json` file; `citations` and `bibliography` specify, as 
  lists, the expected outputs. See below for more details on the test files.

- Run `modish test`.

## Usage

(tbd)

## Test Files

(tbd)
