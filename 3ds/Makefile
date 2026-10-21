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

ARCH   := -march=armv6k -mtune=mpcore -mfloat-abi=hard -mtp=soft
CFLAGS := -g -Wall -O2 -mword-relocations -ffunction-sections $(ARCH) $(INCLUDE) -D__3DS__ -std=gnu11
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
	@bannertool makebanner -i $(BANNER_IMAGE) -a $(BANNER_AUDIO) -o $(BUILD)/banner.bnr
	@bannertool makesmdh -s "$(APP_TITLE)" -l "$(APP_DESCRIPTION)" -p "$(APP_AUTHOR)" -i $(ICON) -o $(BUILD)/icon.icn
	@makerom -f cia -o $(TARGET).cia -elf $(TARGET).elf -rsf $(RSF) -icon $(BUILD)/icon.icn -banner $(BUILD)/banner.bnr -exefslogo -target t
	@echo "-> $(TARGET).cia"

clean:
	@rm -rf $(BUILD) $(TARGET).3dsx $(TARGET).cia $(TARGET).elf $(TARGET).smdh
else
DEPENDS := $(OFILES:.o=.d)
$(OUTPUT).3dsx: $(OUTPUT).elf $(OUTPUT).smdh
$(OUTPUT).elf: $(OFILES)
-include $(DEPENDS)
endif
