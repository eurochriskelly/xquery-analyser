#!/bin/bash
export REPO_DIR="@@REPO_DIR@@"

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
    --db /tmp/xqanalyze/xqy.sqlite \
    --interactive

  echo "LoC in graph $(cat output.gml|wc -l)"
  mv output.gml /tmp/
}

build_imports() {
  echo "Building imports"
  node $REPO_DIR/src/build-imports.js \
    --db /tmp/xqanalyze/xqy.sqlite \
    --remove-isolated

  echo "LoC in graph $(cat imports.gml|wc -l)"
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
  test -f /tmp/xqanalyze/xqy.sqlite && rm /tmp/xqanalyze/xqy.sqlite
  check_for_import_names
  generate_import_db

  ingest_csv_to_sqlite /tmp/xqanalyze/modules.csv /tmp/xqanalyze/xqy.sqlite xqy_modules <<EOF
CREATE TABLE IF NOT EXISTS xqy_modules (
  filename TEXT,
  prefix TEXT,
  uri TEXT,
  filePath TEXT
);

EOF
  ingest_csv_to_sqlite /tmp/xqanalyze/imports.csv /tmp/xqanalyze/xqy.sqlite xqy_imports<<EOF
CREATE TABLE IF NOT EXISTS xqy_modules (
  filename TEXT,
  file TEXT,
  prefix TEXT,
  uri TEXT,
  filePath TEXT,
  numFunctions INTEGER,
  numLines INTEGER
);
EOF

  ingest_csv_to_sqlite /tmp/xqanalyze/functions.csv /tmp/xqanalyze/xqy.sqlite xqy_functions <<EOF
CREATE TABLE IF NOT EXISTS xqy_functions (
  filename TEXT,
  file TEXT,
  name TEXT,
  line INTEGER,
  private BOOLEAN
);
EOF

  ingest_csv_to_sqlite /tmp/xqanalyze/invocations.csv /tmp/xqanalyze/xqy.sqlite xqy_invocations <<EOF
CREATE TABLE IF NOT EXISTS xqy_invocations (
  filename TEXT,
  file TEXT,
  caller TEXT,
  invoked_module TEXT,
  invoked_function TEXT
);
EOF

  ingest_csv_to_sqlite /tmp/xqanalyze/parameters.csv /tmp/xqanalyze/xqy.sqlite xqy_parameters <<EOF
CREATE TABLE IF NOT EXISTS xqy_parameters (
  filename TEXT,
  file TEXT,
  function_name TEXT,
  parameter TEXT,
  type TEXT
);
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
