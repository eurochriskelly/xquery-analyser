#!/bin/bash

cd "$(git rev-parse --show-toplevel)"

node src/extract-functions.js --file-name=test/data/main-fn1.xqy --out-dir=/tmp/test
