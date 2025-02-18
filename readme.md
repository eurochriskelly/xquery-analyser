# xquery-analyser

## Overview
The **xquery-analyser** project is a Node.js-based tool for analyzing XQuery files. It extracts functions and import statements, providing structured data in JSON and CSV formats. The tool is designed to assist developers working with XQuery by parsing relevant information from modules.

## Features
- Extracts function definitions from XQuery files, including:
  - Function names
  - Signatures
  - Body contents
  - Invocation details
- Extracts imported modules from XQuery files and generates CSV reports.
- Supports bulk processing of multiple XQuery files.
- Provides SQLite database integration for import statement analysis.
- Includes a Makefile for easy installation of the tool.

## Installation
To install the **xquery-analyser**, run:

```sh
make install
```

If installing to a system directory like `/usr/local/bin`, you may need to use `sudo`:

```sh
sudo make install
```

## Usage
The primary script for running analyses is `xqanalyze`, which provides multiple modes:

### Extract Functions
Extracts functions from a single XQuery file and outputs JSON:

```sh
xqanalyze --extract-functions example.xqy
```

Extracts functions from all XQuery files in the repository:

```sh
xqanalyze --extract-all-functions
```

### Import Analysis
Generates a report of all imported modules in XQuery files:

```sh
xqanalyze
```

The results are stored in an SQLite database and can be inspected interactively.


