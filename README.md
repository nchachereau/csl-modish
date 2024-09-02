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

- Create a directory named `tests` in your CSL project.

- Add a `references.json` file to the `tests` directory, in
  [CSL-JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html)
  format. Easiest way: export relevant references from your Zotero library.

- Edit `tests/books.yml` (name the test however you want).

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

Test files are expected to be located in a `tests` directory at the root of
your project (or, more exactly, in the directory where you run the
`modish test` command). You can have as many test files as you want, each
testing different things (e.g. different item types, bibliography entries
VS subsequent citations, etc). Furthermore, as described below, each test file
can include a series of different tests. By relying on this, it is also
possible to put all the tests in the same file.

Test files are written in YAML, and need to specify:

- the path of the CSL file to be tested (`style`),
- the identifier of the references in `reference.json` for which citations will
  be generated (`input`),
- and the expected output for these items when they are formatted as `citations`
  and/or `bibliography`.

### style

`style` specifies the path of the CSL file, relative to where you run the
command (typically the root of your project):
```yaml
style: style.csl
```

### input

The input is a list of identifiers:
```yaml
input:
- ThompsonMaking p. 128
- PikettyCapital; MillsPower
- MillsPower
```

The identifiers are the `id` strings in the `references.json` (the
[BetterBibTex](https://retorque.re/zotero-better-bibtex/) plugin gives more
control over these ids when exporting from Zotero). Each identifier in the
`input` list can optionally be followed by a space and a locator, as shown in
the example. All [locators from the CSL specification](https://docs.citationstyles.org/en/stable/specification.html#locators)
are supported, in full or in abbreviated form (use `sub verso` and not
`sub-verso`). To include several references in the same citation (e.g. to test
separators), connect them by semicolons, as in the example.

### output: citations and bibliography

It is possible to test both citations and bibliography, or only either of them,
but at least one must be specified in a test.

The expected **citations** are also given as a list, in the same order as the
`input`:
```yaml
citations:
- Thompson (1991 [1963]), <i>The Making…</i>, p. 128.
- Piketty (2014), <i>Capital…</i>; Mills (1956), <i>The Power Elite</i>.
- Ibid.
```

The expected **bibliography** is also a list, but in the expected order (for
instance, ordered alphabetically if that is what the style specifies):
```yaml
bibliography:
- Mills, C. W. (1959). <i>The power elite</i>. Oxford University Press. (Original work published 1956)
- Piketty, T. (2014). <i>Capital in the Twenty-First Century</i>. Harvard University Press
- Thompson, E. P. (1991). <i>The Making of the English working class</i>. Penguin Books. (Original work published 1963)
```

### several tests in the same file

Alternatively, it is possible to specify a series of tests in the same file.
This is especially useful if the tests use the same style with different
`input`, or different styles with the same `input`. The **tests** are given
as a list, each test in the list specifying the mentioned variables: `style`,
`input`, `citations` and `bibliography`:

```yaml
tests:
- style: style1.csl
  input:
  - ThompsonMaking
  citations:
  - (Thompson)
- style: style2.csl
  input:
  - MillsPower
  citations:
  - (Mills, 1959)
```

Instead of specifying `input` and `style` in the entries in `tests`, they can
be given once at the global level, and each test will reuse these values. For
instance, one could test several styles using the same input:

```yaml
input:
- ThompsonMaking
- MillsPower

tests:
- style: style1.csl
  citations:
  - (Thompson)
  - (Mills)

- style: style2.csl
  citations:
  - (Thompson, 1991)
  - (Mills, 1959)
```

Note that when `tests` is specified, global definitions of `citations` and
`bibliography` will be ignored.
