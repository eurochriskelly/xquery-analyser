# XQuery Analysis Toolset

This repository contains a set of tools for analyzing XQuery (`.xqy`) files, extracting function information, building dependency graphs, and generating call stacks. The tools are written in JavaScript/Node.js and Bash, with data stored in SQLite and output in various formats including JSON, CSV, and GML.

The primary goal of this toolset is to help developers understand and visualize the structure and dependencies within their XQuery codebases, particularly for MarkLogic projects.

## Installation

To make the `xqanalyze` script available globally (i.e., in your system’s PATH), run the following command from the root directory of the repository:

```bash
sudo make install
```

This installs `xqanalyze` to `/usr/local/bin`, allowing you to run it from any directory without specifying the full path. Before running this command, ensure the `REPO_DIR` variable in the `src/xqanalyze` script is set to the absolute path of this repository.

**Note**: If you haven’t cloned the repository yet, do so first:
```bash
git clone <repository-url>
cd <repository-directory>
```

## Prerequisites

To use this toolset, you’ll need the following software installed:

- **Node.js**: Version 14 or higher
- **SQLite3**: For database operations
- **Bash**: For running the main script
- **Git**: For retrieving the list of XQuery files

Install the required Node.js dependencies by running:
```bash
npm install
```

## Usage

The primary entry point is the `xqanalyze` script. After installation, you can run it with various options:

- **`--extract-all-functions`**: Extracts function data from all `.xqy` files in the repository.
- **`--import-checks`**: Processes the extracted data and builds an SQLite database.
- **`--build-stack`**: Generates a function call graph (interactively or with specified module and function).
- **`--build-imports`**: Builds a module dependency graph.

For detailed usage of each option, see the sections below.

## Workflow for Building a Function Call Graph

To generate a graph of a function’s call stack, follow these steps:

### Step 1: Extract Function Data
Run this command to generate JSON files containing function data from all `.xqy` files in your project:
```bash
xqanalyze --extract-all-functions
```
- **What it does**: Processes all `.xqy` files and generates JSON files in `/tmp/xqanalyze/<timestamp>/`.
- **Why it’s first**: This step prepares the raw data needed for analysis.

### Step 2: Build the Database
Next, process those JSON files to create a SQLite database:
```bash
xqanalyze --import-checks
```
- **What it does**: Converts the JSON files to CSV and ingests them into `/tmp/xqanalyze/xqy.sqlite`.
- **Why it’s second**: Organizes the data so the tool can use it effectively for graph generation.

### Step 3: Build the Call Stack Graph
Finally, generate the function call graph:
```bash
xqanalyze --build-stack
```
- **What it does**: Runs interactively, prompting you to select a module and a function from that module. It then generates a GML file representing the function’s call stack.
- **Output**: A file named `output.gml` in `/tmp/`, which you can visualize with tools like yEd or Gephi.

**Important**: The `--interactive` option in `--build-stack` is highly recommended for its ease of use. It guides you through selecting a module and function, preventing errors and simplifying the process.

#### Alternative: Non-Interactive Mode
If you know the exact module and function ahead of time, you can skip the prompts by running:
```bash
xqanalyze --build-stack --module=<module-name> --function=<function-name>
```
However, `--interactive` is often the better choice for its user-friendliness.

## Additional Options

- **`--extract-functions <file.xqy>`**: Analyzes a single XQuery file and outputs function details to stdout in JSON format. Useful for troubleshooting or inspecting specific files.
- **`--build-imports`**: Generates a module dependency graph in GML format, saved to `/tmp/imports.gml`. Requires the same first two steps as building a call stack graph.

## Troubleshooting

Here are some common issues and their solutions:

- **Prerequisites not working**: Ensure all required software (Node.js, SQLite3, Bash, Git) is installed and up-to-date.
- **Permission errors**: Verify that `/tmp/xqanalyze/` is writable by your user.
- **Graph generation fails**: If `--build-stack` or `--build-imports` fails, make sure you’ve run `--import-checks` first.
- **Stale data**: To start fresh and remove all temporary files, run:
  ```bash
  rm -rf /tmp/xqanalyze/
  ```

## Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and feature requests on the repository’s Git hosting platform.

