# Makefile for installing the LazyGH script

# Variables
PREFIX ?= /usr/local
BINDIR ?= $(PREFIX)/bin
SRCDIR ?= src
EXECUTABLE ?= xqanalyze
REPO_DIR := $(shell pwd)
BUILD_TIME := $(shell date +%s)

# Help target
.DEFAULT_GOAL := help
help:  ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# Default target
all: install  ## Alias for install target

install:  ## Install the executable
	@echo "Creating executable script..."
	@echo '#!/usr/bin/env node' > /tmp/$(EXECUTABLE)_tmp
	@echo 'const originalCwd = process.cwd(); process.chdir("$(REPO_DIR)");' >> /tmp/$(EXECUTABLE)_tmp
	@sed -e 's|@@REPO_DIR@@|$(REPO_DIR)|g' -e 's|@@BUILD_TIME@@|$(BUILD_TIME)|g' $(SRCDIR)/$(EXECUTABLE).js >> /tmp/$(EXECUTABLE)_tmp
	@chmod +x /tmp/$(EXECUTABLE)_tmp
	@SUDO=; \
	if [ ! -w $(DESTDIR)$(BINDIR) ]; then \
		SUDO=sudo; \
	fi; \
	echo "Copying $(EXECUTABLE) to $(DESTDIR)$(BINDIR)..."; \
	$$SUDO install -d $(DESTDIR)$(BINDIR); \
	$$SUDO install -m 755 /tmp/$(EXECUTABLE)_tmp $(DESTDIR)$(BINDIR)/$(EXECUTABLE); \
	echo "Cleaning up temporary files..."; \
	rm -f /tmp/$(EXECUTABLE)_tmp; \
	echo "Installation complete: $(DESTDIR)$(BINDIR)/$(EXECUTABLE)"

clean:  ## Clean build artifacts (no-op)
	@echo "Nothing to clean"

.PHONY: all install clean serve api

serve: ## Run the API server
	node src/server.js

api: ## Generate API documentation
	node src/generate-api-spec.js
	redoc-cli bundle ./docs/api/swagger.json -o ./docs/api/index.html
	rm ./docs/api/swagger.json

