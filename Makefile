CMD := deno compile --allow-read --include locales/
MAIN := src/main.js
SOURCES := $(shell find src/ -type f -name '*.js')

DIST_DIR := dist
APP_NAME := modish
VERSION := $(shell jq --raw-output .version deno.json)

OS := linux macos windows
ARCH := x86_64 arm64

# variables for mapping our names for distribution to those used as targets by deno compile
os_name_linux := unknown-linux-gnu
os_name_macos := apple-darwin
os_name_windows := pc-windows-msvc
arch_name_x86_64 := x86_64
arch_name_arm64 := aarch64

# valid deno compile targets
VALID_TARGETS := x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-pc-windows-msvc x86_64-apple-darwin aarch64-apple-darwin

# combine operating systems and architectures and check that the combination is a valid deno compile target
# foreach os: foreach arch: if translated os and arch are found in valid targets, add the name to the list of targets
TARGETS := $(foreach os,$(OS),$(foreach arch,$(ARCH),$(if $(findstring $(arch_name_$(arch))-$(os_name_$(os)),$(VALID_TARGETS)),$(DIST_DIR)/$(APP_NAME)-$(VERSION)-$(os)-$(arch))))
# add .exe to the name of the windows executable, otherwise keep the same name as in targets
EXECUTABLES := $(foreach target,$(TARGETS),$(if $(findstring windows,$(target)),$(target).exe,$(target)))
# everything as zip files
PACKAGED := $(TARGETS:=.zip)
PACKAGED_NOT_WINDOWS := $(foreach package,$(PACKAGED),$(if $(findstring windows,$(package)),,$(package)))

# Commands

.PHONY: build
build: $(PACKAGED) ## Compile and compress for all operating systems and architectures

.PHONY: clean
clean: ## Remove build files such as executables
	rm -f $(DIST_DIR)/*

.PHONY: help
help: ## Show this help
	@grep -E --no-filename '\s##\s' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# zip files

$(DIST_DIR)/$(APP_NAME)-$(VERSION)-windows-%.zip: $(DIST_DIR)/$(APP_NAME)-$(VERSION)-windows-%.exe
	cp $< $(DIST_DIR)/modish.exe
	cd $(DIST_DIR) && zip $(notdir $@) modish.exe && rm modish.exe

$(PACKAGED_NOT_WINDOWS): %.zip: %
	cp $< $(DIST_DIR)/modish
	cd $(DIST_DIR) && zip $(notdir $@) modish && rm modish

# Executables

$(DIST_DIR)/$(APP_NAME)-$(VERSION)-linux-x86_64: $(SOURCES)
	mkdir -p $(DIST_DIR)
	$(CMD) --target x86_64-unknown-linux-gnu --output $@ $(MAIN)

$(DIST_DIR)/$(APP_NAME)-$(VERSION)-linux-arm64: $(SOURCES)
	$(CMD) --target aarch64-unknown-linux-gnu --output $@ $(MAIN)

$(DIST_DIR)/$(APP_NAME)-$(VERSION)-macos-x86_64: $(SOURCES)
	$(CMD) --target x86_64-apple-darwin --output $@ $(MAIN)

$(DIST_DIR)/$(APP_NAME)-$(VERSION)-macos-arm64: $(SOURCES)
	$(CMD) --target aarch64-apple-darwin --output $@ $(MAIN)

$(DIST_DIR)/$(APP_NAME)-$(VERSION)-windows-x86_64.exe: $(SOURCES)
	$(CMD) --target x86_64-pc-windows-msvc --output $@ $(MAIN)
