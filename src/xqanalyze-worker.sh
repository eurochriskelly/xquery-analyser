#!/bin/bash

export REPO_DIR="@@REPO_DIR@@"
# DB_FILE is now passed as the second argument to the script
DB_FILE=$2

hh "DEBUG: xqanalyze-worker.sh received DB_FILE as: $DB_FILE"

# Check if a temporary directory is provided as an argument
if [ -n "$3" ]; then
  tdir=$3
else
  ts=$(date +%s)
  tdir=/tmp/xqanalyze/$ts
fi

main() {
  hh "Running xqanalyze-worker with DB_FILE: $DB_FILE"

  case $1 in
  --extract-functions | -x)
    option=extract_functions
    if [ ! -f $3 ]; then # $3 because $2 is DB_FILE
      hh "File $3 does not exist"
      exit 1
    fi
    file=$3
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
  hh "Option: $option"

  # Run the function matching the selected option
  $option $file
}

build_stack() {
  hh "Building stack using DB: $DB_FILE"
  node $REPO_DIR/src/build-stack.js \
    --db $DB_FILE \
    --interactive

  hh "LoC in graph $(cat output.gml|wc -l)"
  hh "Nodes in graph $(cat output.gml|grep node|wc -l)"
  hh "Depth of graph $(cat output.gml|grep level|grep -v reverse|sort|uniq|sort|awk '{ print $2 }'|sort -n|tail -n 1)"
  mv output.gml /tmp/
}

build_imports() {
  hh "Building imports using DB: $DB_FILE"
  node $REPO_DIR/src/build-imports.js \
    --db $DB_FILE \
    --remove-isolated

  hh "LoC in graph $(cat imports.gml|wc -l)"
  hh "Nodes in graph $(cat imports.gml|grep node|wc -l)"
  hh "Max level: $(cat /tmp/output.gml|grep level|grep -v reverse|sort|uniq|sort|awk '{ print $2 }'|sort -n|tail -n 1)"

  if [ -f /tmp/imports.gml ]; then 
    mv imports.gml /tmp/
  fi

}

extract_all_functions() {
  hh "Extracting all functions"
  if [ -d "$tdir" ]; then rm -rf $tdir;fi
  hh "Making temp dir $tdir"
  mkdir -p $tdir
  gen_file_list
  i=1
  for f in $(cat $tdir/xqyfiles.txt); do
    hh "${i}: Processing file: $f"
    node $REPO_DIR/src/extract-functions.js \
      --file-name=$f \
      --out-dir=$tdir
    i=$((i + 1))
  done
}

extract_functions() {
  hh "Extracting functions"
  local file=$1
  node $REPO_DIR/src/extract-functions.js --file-name=$file
}

import_checks() {
  hh "Running import checks. Database will be created at: $DB_FILE"
  gen_file_list
  rm "$tdir"/*.csv
  test -f "$DB_FILE" && rm "$DB_FILE" # Ensure DB_FILE is quoted
  check_for_import_names
  generate_import_db

  ingest_csv_to_sqlite "$tdir/modules.csv" "$DB_FILE" xqy_modules <<EOF
CREATE TABLE IF NOT EXISTS xqy_modules (
  filename TEXT,
  prefix TEXT,
  uri TEXT,
  filePath TEXT
);

EOF
  ingest_csv_to_sqlite "$tdir/imports.csv" "$DB_FILE" xqy_imports<<EOF
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

  ingest_csv_to_sqlite "$tdir/functions.csv" "$DB_FILE" xqy_functions <<EOF
CREATE TABLE IF NOT EXISTS xqy_functions (
  filename TEXT,
  file TEXT,
  name TEXT,
  line INTEGER,
  private BOOLEAN,
  loc INTEGER
);
EOF

  ingest_csv_to_sqlite "$tdir/invocations.csv" "$DB_FILE" xqy_invocations <<EOF
CREATE TABLE IF NOT EXISTS xqy_invocations (
  filename TEXT,
  file TEXT,
  caller TEXT,
  invoked_module TEXT,
  invoked_function TEXT
);
EOF

  ingest_csv_to_sqlite "$tdir/parameters.csv" "$DB_FILE" xqy_parameters <<EOF
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

  hh "Modules row count: $(wc -l "$tdir/modules.csv")"
  hh "Imports row count: $(wc -l "$tdir/imports.csv")"
  hh "Functions row count: $(wc -l "$tdir/functions.csv")"
  hh "Invocations row count: $(wc -l "$tdir/invocations.csv")"
  hh "Parameters row count: $(wc -l "$tdir/parameters.csv")"
}

gen_file_list() {
  hh "Generating file list from current directory using find"
  find . -name "*.xqy" >"$tdir/xqyfiles.txt"
}
extract_functions() {
  local file=$1
  node $REPO_DIR/src/extract-functions.js \
    --file-name="$file" \
    --out-dir="$tdir"
}

# Function to ingest CSV into SQLite
ingest_csv_to_sqlite() {
  hh "Ingesting CSV into SQLite"
  local csv_file=$1
  local db_file=$2
  local table_name=$3

  hh "Inside ingest_csv_to_sqlite: csv_file='$csv_file', db_file='$db_file', table_name='$table_name'"

  # Check if the CSV file exists
  if [[ ! -f "$csv_file" ]]; then
    hh "CSV file '$csv_file' does not exist."
    return 1
  fi

  # Check if the database file exists, if not, create it
  if [[ ! -f "$db_file" ]]; then
    hh "Database file '$db_file' does not exist, creating new database..."
    hh "DEBUG: Attempting to create database at: $db_file"
    sqlite3 "$db_file" "VACUUM;"
  fi

  # Import the CSV data into the table (ignoring the first row - the header)
  hh "Importing '$csv_file' into '$db_file' table '$table_name'"
  hh "DEBUG: Running sqlite3 import command for db_file: $db_file"
  sqlite3 -separator ',' "$db_file" ".import '$csv_file' $table_name"

  hh "Data successfully ingested into '$db_file' table '$table_name'."
  hh "To open with sqlitestudio, run 'sqlitestudio $db_file'"
}

generate_import_db() {
  hh "Generating import database from JSON files"
  local index=0
  i=1 
  withHeader=true
  for f in $(find "$tdir" -name "*.json"); do
    hh "${i}: Processing file: $f ..."
    if [ -f "$tdir/functions.csv" ];then withHeader=false;fi
    node $REPO_DIR/src/import-rows.js \
      --file-name="$f" \
      --with-header=$withHeader \
      --out-dir="$tdir"
    i=$((i+1))
  done
}

check_for_import_names() {
  getmods() {
    for f in $(cat "$tdir/xqyfiles.txt"); do
      cat "$f" | grep "^module namespace" | awk '{print $3}' | awk -F= '{print $1}'
    done
  }
  hh "Found the following module namespaces:"
  getmods | sort | uniq -c | while read count name; do
    hh "  $name ($count instances)"
  done
}
# Create a function to print a message in red with a timestamp prepended
hh() {
  echo -e "\033[33m$(date +%H:%M:%S) $1\033[0m"
}

main $@
