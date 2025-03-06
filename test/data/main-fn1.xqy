xquery version "1.0-ml";

import module namespace bar = "my/namespace/bar" at "/path/to/bar.xqy";

declare function local:some-function() {
    (: this should have a body size of 2 :)
    xdmp:log("this is a simple function, take 1"),
    xdmp:log("this is a simple function, take 2")
};

(: the main function should have a body size of 3 :)

let $_ := xdmp:log("Outside function code")
let $val := bar:get-some-data("data")
return $val
