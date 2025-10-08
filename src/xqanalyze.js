console.log('xqanalyze build @@BUILD_TIME@@');

const { exec } = require('child_process');

const args = process.argv.slice(2);
const dbFile = '/tmp/xqanalyze/xqy.sqlite';
const repoDir = '@@REPO_DIR@@';
const workerScript = `${repoDir}/src/xqanalyze-worker.sh`;
const buildStackScript = `${repoDir}/src/build-stack.js`;
const buildTime = Math.floor(Date.now() / 1000).toString();

const baseExecOptions = {
  cwd: repoDir,
  env: {
    ...process.env,
    WORKING_DIR: originalCwd,
    BUILD_TIME: buildTime
  }
};

if (args.includes('--init')) {
  const tempDir = `/tmp/xqanalyze/${Date.now()}`;
  exec(`bash "${workerScript}" --extract-all-functions "${dbFile}" "${tempDir}" && bash "${workerScript}" --import-checks "${dbFile}" "${tempDir}"`, baseExecOptions, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      console.error(stderr);
      process.exit(1);
    }
    console.log(stdout);
  });
} else if (args.includes('--module') && args.includes('--function')) {
  const moduleIndex = args.indexOf('--module');
  const functionIndex = args.indexOf('--function');
  const moduleName = args[moduleIndex + 1];
  const functionName = args[functionIndex + 1];
  exec(`node "${buildStackScript}" --db "${dbFile}" --module "${moduleName}" --function "${functionName}"`, baseExecOptions, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      console.error(stderr);
      process.exit(1);
    }
    console.log(stdout);
  });
} else {
  // Interactive mode
  exec(`node "${buildStackScript}" --db "${dbFile}" --interactive`, baseExecOptions, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      console.error(stderr);
      process.exit(1);
    }
    console.log(stdout);
  });
}
