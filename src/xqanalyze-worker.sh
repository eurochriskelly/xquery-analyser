#!/bin/bash

export REPO_DIR="@@REPO_DIR@@"
DB_FILE=/tmp/xqanalyze/xqy.sqlite

ts=$(date +%s)
tdir=/tmp/xqanalyze/$ts

main() {
  echo "Running xqanalyze"

  case $1 in
  --extract-functions | -x)
    option=extract_functions
    if [ ! -f $2 ]; then
      echo "File $2 does not exist"
      exit 1
    fi
    file=$2
    ;;

  --extract-all-functions | -a)
    option=extract_all_functions
    ;;

  --build-stack)
    option="build_stack"
    ;;

  --build-imports)
    option="build_imports"
    ;;

  --import-checks | "*")
    option="import_checks"
    ;;

  esac
  echo "Option: $option"

  # Run the function matching the selected option
  $option $file
}

build_stack() {
  echo "Building stack"
  node $REPO_DIR/src/build-stack.js \
    --db $DB_FILE \
    --interactive

  echo "LoC in graph $(cat output.gml|wc -l)"
  echo "Nodes in graph $(cat output.gml|grep node|wc -l)"
  mv output.gml /tmp/
}

build_imports() {
  echo "Building imports"
  node $REPO_DIR/src/build-imports.js \
    --db $DB_FILE \
    --remove-isolated

  echo "LoC in graph $(cat imports.gml|wc -l)"
  echo "Nodes in graph $(cat imports.gml|grep node|wc -l)"
  echo "Max level: $(cat /tmp/output.gml|grep level|grep -v reverse|sort|uniq|sort|awk '{ print $2 }'|sort -n|tail -n 1)"

  if [ -f /tmp/imports.gml ]; then 
    mv imports.gml /tmp/
  fi

}

extract_all_functions() {
  echo "Extracting all functions"
  if [ -d "$tdir" ]; then rm -rf $tdir;fi
  echo "Making temp dir $tdir"
  mkdir -p $tdir
  gen_file_list
  i=1
  for f in $(cat $tdir/xqyfiles.txt); do
    echo "${i}: Processing file: $f"
    node $REPO_DIR/src/extract-functions.js \
      --file-name=$f \
      --out-dir=$tdir
    i=$((i + 1))
  done
}

extract_functions() {
  echo "Extracting functions"
  local file=$1
  node $REPO_DIR/src/extract-functions.js --file-name=$file
}

import_checks() {
  gen_file_list
  rm /tmp/xqanalyze/*.csv
  test -f $DB_FILE && rm $DB_FILE
  check_for_import_names
  generate_import_db

  ingest_csv_to_sqlite /tmp/xqanalyze/modules.csv $DB_FILE xqy_modules <<EOF
CREATE TABLE IF NOT EXISTS xqy_modules (
  filename TEXT,
  prefix TEXT,
  uri TEXT,
  filePath TEXT
);

EOF
  ingest_csv_to_sqlite /tmp/xqanalyze/imports.csv $DB_FILE xqy_imports<<EOF
CREATE TABLE IF NOT EXISTS xqy_imports (
  filename TEXT,
  file TEXT,
  prefix TEXT,
  uri TEXT,
  filePath TEXT,
  numFunctions INTEGER,
  numLines INTEGER
);
EOF

  ingest_csv_to_sqlite /tmp/xqanalyze/functions.csv $DB_FILE xqy_functions <<EOF
CREATE TABLE IF NOT EXISTS xqy_functions (
  filename TEXT,
  file TEXT,
  name TEXT,
  line INTEGER,
  private BOOLEAN,
  loc INTEGER,
);
EOF

  ingest_csv_to_sqlite /tmp/xqanalyze/invocations.csv $DB_FILE xqy_invocations <<EOF
CREATE TABLE IF NOT EXISTS xqy_invocations (
  filename TEXT,
  file TEXT,
  caller TEXT,
  invoked_module TEXT,
  invoked_function TEXT
);
EOF

  ingest_csv_to_sqlite /tmp/xqanalyze/parameters.csv $DB_FILE xqy_parameters <<EOF
CREATE TABLE IF NOT EXISTS xqy_parameters (
  filename TEXT,
  file TEXT,
  function_name TEXT,
  parameter TEXT,
  type TEXT
);
EOF

sqlite3 "$DB_FILE" <<EOF
DROP VIEW IF EXISTS extended_xqy_functions;

CREATE VIEW extended_xqy_functions AS
SELECT
    f.*,
    (SELECT COUNT(*)
     FROM xqy_invocations xi 
     WHERE xi.invoked_function = f.name) AS numInvocations,
    CASE WHEN f.loc > 0 THEN 1.0 / f.loc ELSE 0 END AS invertedLoc
FROM xqy_functions f;
EOF

  echo "Modules row count: $(wc -l /tmp/xqanalyze/modules.csv)"
  echo "Imports row count: $(wc -l /tmp/xqanalyze/imports.csv)"
  echo "Functions row count: $(wc -l /tmp/xqanalyze/functions.csv)"
  echo "Invocations row count: $(wc -l /tmp/xqanalyze/invocations.csv)"
  echo "Parameters row count: $(wc -l /tmp/xqanalyze/parameters.csv)"
}

gen_file_list() {
  git ls-files | grep "\.xqy$" >$tdir/xqyfiles.txt
}
extract_functions() {
  local file=$1
  node $REPO_DIR/src/extract-functions.js --file-name=$file
}

# Function to ingest CSV into SQLite
ingest_csv_to_sqlite() {
  hh "Ingesting CSV into SQLite"
  local csv_file=$1
  local db_file=$2
  local table_name=$3

  # Check if the CSV file exists
  if [[ ! -f "$csv_file" ]]; then
    echo "CSV file '$csv_file' does not exist."
    return 1
  fi

  # Check if the database file exists, if not, create it
  if [[ ! -f "$db_file" ]]; then
    echo "Database file '$db_file' does not exist, creating new database..."
    sqlite3 "$db_file" "VACUUM;"
  fi

  # Import the CSV data into the table (ignoring the first row - the header)
  sqlite3 -separator ',' "$db_file" ".import '$csv_file' $table_name"

  echo "Data successfully ingested into '$db_file' table '$table_name'."
  echo "To open with sqlitestudio, run 'sqlitestudio $dbfile'"
}

generate_import_db() {
  hh "Generating import database"
  local index=0
  i=1 
  withHeader=true
  for f in $(find /tmp/xqanalyze/ -name "*.json"); do
    echo -n "${i}: Processing file: $f ..."
    if [ -f "/tmp/xqanalyze/functions.csv" ];then withHeader=false;fi
    node $REPO_DIR/src/import-rows.js --file-name=$f --with-header=$withHeader
    echo "done!"
    i=$((i+1))
  done
}

check_for_import_names() {
  getmods() {
    for f in $(cat $tdir/xqyfiles.txt); do
      cat $f | grep "^module namespace" | awk '{print $3}' | awk -F= '{print $1}'
    done
  }
  hh "Found the following module namespaces:"
  getmods | sort | uniq -c | while read count name; do
    echo "  $name ($count instances)"
  done
}
# Create a function to print a message in red with a timestamp prepended
hh() {
  echo -e "\033[33m$(date +%H:%M:%S) $1\033[0m"
}

main $@
