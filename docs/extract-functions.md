# Extract xquery functions from a module

Given an xquery file, this nodejs module extracts all functions and stores the following information in a json object:

    {
        "file": "example.xqy",
        "namespace": {
            "uri": "foo/namespace-name",
            "prefix": "foo"
        },
        "functions": [
            {
                "name": "function-name",
                "line": 1
                "signature": "function-name($arg1 as xs:string, $arg2 as xs:string) as xs:string",
                "body": "..." 
            },
            {
                ... etc ...
            }
        ]
    }

where: 

- the namespace is the namespace of the module itself declared as `module namespace foo = "foo/namespace-name";`
- the functions array contains all the functions defined in the module

Functions in XQuery files are typically follow a pattern like this:
    
    module namespace foo = "foo/namespace-name";

    declare function foo:function-name($arg1 as xs:string, $arg2 as xs:string) as xs:string {
        ...
    };

    ... more functions ...

However, the function definition may also be spread over more than one line and will be terminated by a semicolon. For example:

    declare function foo:function-name(
        $arg1 as xs:string, 
        $arg2 as xs:string
    ) as xs:string {
        ...
    };

## Implementation

In order to reduce errors, 4 steps are taken to extract the functions:
1. The comments are removed from the file
2. When processing the functions, only the content starting from the first declare function statement is considered
3. The next function is processed with a multi-line regex that captures the function signature and the function body
4. The function is removed from the content-to-be-processed and the process is repeated until no more functions are found

## Usage

    node extract-functions.js --file-name=example.xqy