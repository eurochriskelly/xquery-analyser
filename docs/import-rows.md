# Import rows module

This nodejs module extracts all import modules from an xquery file and returns 0 or more csv rows containing the following columns:

- `abbrev`: The abbreviation of the module used to reference the module throughout the file
- `namespace`: The name of the module
- `path`: The path to the module
- `client`: The client that the module belongs to (i.e. the --file-name being analyzed)
- `local`: Whether the module is part of the list of modules being analyzed in the --input-list

In the XQuery file, the import modules always look like this:

    import module namespace abbrev = "namespace" at "path";

There may be multiple import modules in a single XQuery file. The import statement may be spread over more than one line and will be terminated by a semicolon.

The typical usage of the tool is as follows:

    node import-rows.js --file-name=example.xqy --input-list=file-list.txt


## Command line arguments

Optional arguments:
--with-headers: Includ

## Extended Function View (`extended_xqy_functions`)

This view provides additional calculated metrics useful for graph visualization:

- `numInvocations`: Total historical count of invocations for the function across all analyzed code.
- `invertedCallCount`: The inverse of the current graph-specific call count, highlighting less frequently called functions.
- `LoC`: Number of lines in the function.
- `invertedLoC`: The inverse of `bodyCount`, helping identify overly abstracted functions.e headers in the output
