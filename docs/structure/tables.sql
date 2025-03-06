-- Create the xqy_modules table
CREATE TABLE IF NOT EXISTS xqy_modules (
  filename TEXT,
  file TEXT,
  prefix TEXT,
  uri TEXT,
  filePath TEXT,
  numFunctions INTEGER,
  numLines INTEGER
);

-- Create the xqy_functions table
CREATE TABLE IF NOT EXISTS xqy_functions (
  filename TEXT,
  file TEXT,
  name TEXT,
  line INTEGER,
  private BOOLEAN,
  loc INTEGER
);

-- Create the xqy_invocations table
CREATE TABLE IF NOT EXISTS xqy_invocations (
  filename TEXT,
  file TEXT,
  caller TEXT,
  invoked_module TEXT,
  invoked_function TEXT
);

-- Create the xqy_parameters table
CREATE TABLE IF NOT EXISTS xqy_parameters (
  filename TEXT,
  file TEXT,
  function_name TEXT,
  parameter TEXT,
  type TEXT
);

-- Indexes for performance improvements
CREATE INDEX IF NOT EXISTS idx_xqy_functions_name ON xqy_functions(name);
CREATE INDEX IF NOT EXISTS idx_xqy_invocations_caller ON xqy_invocations(caller);
CREATE INDEX IF NOT EXISTS idx_xqy_parameters_function_name ON xqy_parameters(function_name);

CREATE VIEW extended_xqy_functions AS
SELECT
    f.*,
    (SELECT COUNT(*)
     FROM xqy_invocations xi 
     WHERE xi.invoked_function = f.name) AS numInvocations,
    CASE WHEN f.loc > 0 THEN 1.0 / f.loc ELSE 0 END AS invertedLoc
FROM xqy_functions f;
