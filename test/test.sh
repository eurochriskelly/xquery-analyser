#!/bin/bash

cd "$(git rev-parse --show-toplevel)"

node src/extract-functions.js --file-name=test/data/main-fn1.xqy --out-dir=/tmp/test
echo "press ENTER to view "
read x
less /tmp/test/test_data_main-fn2.xqy.json
