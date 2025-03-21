# XQuery Call Stack Generator

The `xqyanalyse` tool helps you analyze XQuery (`.xqy`) files in your project by generating function call stack graphs. It’s designed to be simple to use: initialize your project once, then generate call stacks interactively or with specific parameters. Output is provided in GML format, which you can visualize with tools like yEd or Gephi.

## Installation

To install `xqyanalyse` and make it available globally (i.e., in your system’s PATH), run the following command from the root directory of this repository:

```bash
sudo make install
```

This installs `xqyanalyse` to `/usr/local/bin`, allowing you to run it from any directory as `xqyanalyse`. Before running this command, ensure the `REPO_DIR` variable in `src/xqyanalyse` is set to the absolute path of this repository (e.g., `/home/user/xquery-toolset`).

**Note**: If you haven’t cloned the repository yet, do so first:
```bash
git clone <repository-url>
cd <repository-directory>
```

## Prerequisites

To use `xqyanalyse`, you’ll need:
- **Node.js**: Version 14 or higher
- **SQLite3**: For database operations
- **Bash**: For running the script
- **Git**: To identify `.xqy` files in your repository

Install the required Node.js dependencies by running:
```bash
npm install
```

## Usage

Run `xqyanalyse` with or without options to analyze your XQuery project:

### Basic Command
```bash
xqyanalyse
```
- **If initialized**: Launches an interactive mode to select a module and function, then generates a call stack graph.
- **If not initialized**: Prompts you to initialize the analysis with “Do you want to run --init? (y/n)”.

### Options
- **`--init [--verbose]`**: Initializes the analysis by processing all `.xqy` files in your repository. Add `--verbose` to see detailed progress messages.
- **`--module=<module-name> --function=<function-name>`**: Generates a call stack graph for a specific module and function (e.g., `--module=example.xqy --function=local:func#2`).
- **`--all <extra-params>`**: Generates a call stack graph with additional parameters (advanced use; consult project documentation for valid parameters).
- **`--verbose`**: Shows detailed output for non-interactive commands.

## Workflow for Generating a Call Stack Graph

### Step 1: Initialize the Analysis
Run this command to prepare your project for analysis:
```bash
xqyanalyse --init
```
- **What it does**: Clears any previous analysis data and processes all `.xqy` files to create a database at `/tmp/xqanalyze/xqy.sqlite`.
- **Optional**: Use `--verbose` for more details:
  ```bash
  xqyanalyse --init --verbose
  ```
- **Output**: A confirmation message like “Initialization complete. Database created at /tmp/xqanalyze/xqy.sqlite”.

### Step 2: Generate the Call Stack Graph
After initialization, run:
```bash
xqyanalyse
```
- **What it does**: Starts an interactive session where you:
  1. Select a module from a list of `.xqy` files.
  2. Choose a function from that module.
  3. Generate a call stack graph based on your selection.
- **Output**: A GML file at `/tmp/output.gml`.

#### Alternative: Specify a Module and Function
If you know the exact module and function, skip the interactive mode:
```bash
xqyanalyse --module=example.xqy --function=local:func#2
```
- **Output**: Generates `/tmp/output.gml` directly for the specified function.

## Clearing Previous Analysis
To start fresh (e.g., after updating your `.xqy` files), simply re-run:
```bash
xqyanalyse --init
```
This deletes the existing database and rebuilds it.

## Viewing the Results
- The output file `/tmp/output.gml` is a graph in GML format.
- Open it with a graph visualization tool like yEd (free) or Gephi to explore the call stack.

## Troubleshooting
- **“No database found”**: Run `xqyanalyse --init` to create the database.
- **No prompts appear**: Ensure your terminal supports interactive input and that prerequisites are installed.
- **Errors during initialization**: Verify `.xqy` files exist in your repository and you have write permissions to `/tmp/xqanalyze/`.
- **Output file missing**: Check for error messages; ensure the database at `/tmp/xqanalyze/xqy.sqlite` was created successfully.

## Example Commands
- Initialize silently:
  ```bash
  xqyanalyse --init
  ```
- Initialize with details:
  ```bash
  xqyanalyse --init --verbose
  ```
- Generate a call stack interactively:
  ```bash
  xqyanalyse
  ```
- Generate a specific call stack:
  ```bash
  xqyanalyse --module=main.xqy --function=local:process#1
  ```

