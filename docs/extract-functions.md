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
            }
        ]
    }

Functions in XQuery files are typically defined as follows:
    
    module namespace foo = "foo/namespace-name";

    declare function foo:function-name($arg1 as xs:string, $arg2 as xs:string) as xs:string {
        ...
    };

However, the function definition may be spread over more than one line and will be terminated by a semicolon.

## Usage

    node extract-functions.js --file-name=example.xqy