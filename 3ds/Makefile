# Blocksy 3DS. Requiere devkitARM + libctru + citro2d/citro3d (devkitPro) y, para .cia, makerom + bannertool.
#   make          -> .3dsx (Homebrew Launcher)
#   make cia      -> .cia  (instalable con FBI)
.SUFFIXES:
ifeq ($(strip $(DEVKITARM)),)
$(error "Define DEVKITARM (export DEVKITARM=/opt/devkitpro/devkitARM)")
endif
TOPDIR ?= $(CURDIR)
include $(DEVKITARM)/3ds_rules

TARGET      := blocksy
BUILD       := build
SOURCES     := source
INCLUDES    := source
APP_TITLE   := Blocksy
APP_DESCRIPTION := Mundo de bloques multijugador
APP_AUTHOR  := Blocksy
ICON        := assets/icon.png
BANNER_IMAGE := assets/banner.png
BANNER_AUDIO := assets/audio.wav
RSF         := blocksy.rsf

# Versión: la pone el workflow (BLOCKSY_VERSION=0.1.0 o 0.1.0-dev.N); por defecto sale del fichero VERSION de la raíz
BLOCKSY_VERSION ?= $(shell tr -d '[:space:]' < ../VERSION 2>/dev/null || echo 0.0.0)
# makerom -ver = major<<10 | minor<<4 | micro
APP_VER := $(shell echo '$(BLOCKSY_VERSION)' | sed 's/-.*//' | awk -F. '{print ($$1*1024)+($$2*16)+$$3}')
MAKEROM    ?= makerom
BANNERTOOL ?= bannertool

ARCH   := -march=armv6k -mtune=mpcore -mfloat-abi=hard -mtp=soft
CFLAGS := -g -Wall -O2 -mword-relocations -ffunction-sections $(ARCH) $(INCLUDE) -D__3DS__ -DBLOCKSY_VERSION=\"$(BLOCKSY_VERSION)\" -std=gnu11
LDFLAGS = -specs=3dsx.specs -g $(ARCH) -Wl,-Map,$(notdir $*.map)
LIBS   := -lcitro2d -lcitro3d -lctru -lm
LIBDIRS := $(PORTLIBS) $(CTRULIB)

ifneq ($(BUILD),$(notdir $(CURDIR)))
export OUTPUT := $(CURDIR)/$(TARGET)
export TOPDIR := $(CURDIR)
export VPATH  := $(foreach d,$(SOURCES),$(CURDIR)/$(d))
export DEPSDIR := $(CURDIR)/$(BUILD)
export CFILES := $(foreach d,$(SOURCES),$(notdir $(wildcard $(d)/*.c)))
export OFILES := $(CFILES:.c=.o)
export LD := $(CC)
export INCLUDE := $(foreach d,$(INCLUDES),-I$(CURDIR)/$(d)) $(foreach d,$(LIBDIRS),-I$(d)/include) -I$(CURDIR)/$(BUILD)
export LIBPATHS := $(foreach d,$(LIBDIRS),-L$(d)/lib)
export APP_ICON := $(TOPDIR)/$(ICON)

.PHONY: all clean cia
all: source/config.h
	@mkdir -p $(BUILD)
	@$(MAKE) --no-print-directory -C $(BUILD) -f $(CURDIR)/Makefile

source/config.h:
	$(error "Falta source/config.h: copia source/config.h.example y rellénalo")

cia: all
	@$(BANNERTOOL) makebanner -i $(BANNER_IMAGE) -a $(BANNER_AUDIO) -o $(BUILD)/banner.bnr
	@$(BANNERTOOL) makesmdh -s "$(APP_TITLE)" -l "$(APP_DESCRIPTION)" -p "$(APP_AUTHOR)" -i $(ICON) -o $(BUILD)/icon.icn
	@$(MAKEROM) -f cia -o $(TARGET).cia -elf $(TARGET).elf -rsf $(RSF) -icon $(BUILD)/icon.icn -banner $(BUILD)/banner.bnr -DAPP_TITLE="$(APP_TITLE)" -DAPP_PRODUCT_CODE="CTR-BLK" -DAPP_UNIQUE_ID="0xB10C5" -exefslogo -target t -ver $(APP_VER)
	@echo "-> $(TARGET).cia"

clean:
	@rm -rf $(BUILD) $(TARGET).3dsx $(TARGET).cia $(TARGET).elf $(TARGET).smdh
else
DEPENDS := $(OFILES:.o=.d)
$(OUTPUT).3dsx: $(OUTPUT).elf $(OUTPUT).smdh
$(OUTPUT).elf: $(OFILES)
-include $(DEPENDS)
endif
