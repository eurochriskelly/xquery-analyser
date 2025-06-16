#!/bin/bash

cd "$(git rev-parse --show-toplevel)"

echo "Testing make help output..."
if ! make | grep -q 'install.*Install the executable'; then
  echo "FAIL: make help output missing expected content"
  exit 1
else
  echo "PASS: make help shows targets"
fi

node src/extract-functions.js --file-name=test/data/main-fn1.xqy --out-dir=/tmp/test
echo "press ENTER to view extracted functions"
read x
less /tmp/test/test_data_main-fn2.xqy.json
