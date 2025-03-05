xquery version "1.0-ml";

import module namespace bar = "my/namespace/bar" at "/path/to/bar.xqy";

declare function local:some-function() {
    xdmp:log("this is a simple function")
};

let $_ := xdmp:log("Outside function code")
let $val := bar:get-some-data("data")
return $val
