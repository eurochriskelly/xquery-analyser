# Makefile for installing the LazyGH script

# Variables
PREFIX ?= /usr/local
BINDIR ?= $(PREFIX)/bin
SRCDIR ?= src
EXECUTABLE ?= xqanalyze
REPO_DIR := $(shell pwd)

# Help target
.DEFAULT_GOAL := help
help:  ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# Default target
all: install  ## Alias for install target

install: $(SRCDIR)/$(EXECUTABLE)  ## Install the executable
	@echo "Replacing @@REPO_DIR@@ with the current directory path..."
	@sed 's|@@REPO_DIR@@|$(REPO_DIR)|g' $(SRCDIR)/$(EXECUTABLE) > /tmp/$(EXECUTABLE)_tmp
	@sed 's|@@REPO_DIR@@|$(REPO_DIR)|g' $(SRCDIR)/$(EXECUTABLE)-worker.sh > /tmp/$(EXECUTABLE)-worker_tmp
	@chmod +x /tmp/$(EXECUTABLE)_tmp /tmp/$(EXECUTABLE)-worker_tmp
	@SUDO=; \
	if [ ! -w $(DESTDIR)$(BINDIR) ]; then \
		SUDO=sudo; \
	fi; \
	echo "Copying $(EXECUTABLE) to $(DESTDIR)$(BINDIR)..."; \
	$$SUDO install -d $(DESTDIR)$(BINDIR); \
	$$SUDO install -m 755 /tmp/$(EXECUTABLE)_tmp $(DESTDIR)$(BINDIR)/$(EXECUTABLE); \
	echo "Copying $(EXECUTABLE)-worker to $(DESTDIR)$(BINDIR)..."; \
	$$SUDO install -m 755 /tmp/$(EXECUTABLE)-worker_tmp $(DESTDIR)$(BINDIR)/$(EXECUTABLE)-worker; \
	echo "Cleaning up temporary files..."; \
	rm -f /tmp/$(EXECUTABLE)_tmp /tmp/$(EXECUTABLE)-worker_tmp; \
	echo "Installation complete: $(DESTDIR)$(BINDIR)/$(EXECUTABLE) and $(EXECUTABLE)-worker"

clean:  ## Clean build artifacts (no-op)
	@echo "Nothing to clean"

.PHONY: all install clean
