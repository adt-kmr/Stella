SHELL           := /usr/bin/zsh

### ---------------------------------------------------
### Icons
### ---------------------------------------------------
ICONS_FOLDER	:= assets/icons
ICONS		+= simple/github simple/googlecolab simple/googleslides

### ---------------------------------------------------
### Make Documentation
### ---------------------------------------------------
ENV 		:= emacs
CONDA_ROOT	:= ~/miniconda3

# HOST left blank to enable the default defined in the
# underlying toolkit
HOST		:=

# The default behaviour for PORT in this Makefile is
# defined to use a random 4-digit port.  To use a
# specific port use PORT=NNNN while invocation.  To
# revert to default behaviour of the underlying
# toolkit, explicitly invoke with empty value,
# i.e. PORT="".
PORT		:=
localport	 = $(shell				\
  echo $$(( 1000 + ($$RANDOM % 9000) ))			\
)

# Use `ADDR="HOST:PORT"' as a shorthand instead of
# `HOST="HOST" PORT="PORT"'
ADDR		:= $(and $(or $(HOST),$(PORT)),		\
  $(or $(HOST),localhost):$(or $(PORT),$(localport))	\
)
ADDR_SWITCH	:= $(and $(ADDR),-a $(ADDR))

PYTHONPATH	:= $${PYTHONPATH}:$${PWD}:$${PWD}/src

mkdocs		+= source $(CONDA_ROOT)/bin/activate
mkdocs		+= $(ENV) ; PYTHONPATH=$(PYTHONPATH)
mkdocs		+= mkdocs

docserve : icons
	$(mkdocs) serve $(ADDR_SWITCH) --livereload

docbuild : icons
	$(mkdocs) build

docs : docserve

icons : $(ICONS_FOLDER) ${ICONS:%=$(ICONS_FOLDER)/%.svg}
$(ICONS_FOLDER)/simple/%.svg: $(ICONS_FOLDER)/simple
	wget "https://simpleicons.org/icons/$(*).svg" 	\
	  -O $(@)

$(ICONS_FOLDER)/simple $(ICONS_FOLDER) :
	mkdir -p $(@)
### ---------------------------------------------------

### ---------------------------------------------------
### STELLA (Python + frontend)
### ---------------------------------------------------
PYTHON		?= python
API_HOST	?= 127.0.0.1
API_PORT	?= 8000
FRONTEND	?= frontend

help:			## show targets
	@echo "docs  : serve mkdocs         | install: pip install -e .[dev]"
	@echo "api   : run FastAPI backend  | frontend: run Vite dashboard"
	@echo "data  : download GOES data   | test: run pytest suite"

install:		## install package + dev extras
	$(PYTHON) -m pip install -e ".[dev]"

api:			## run FastAPI backend with hot-reload
	$(PYTHON) -m uvicorn api.main:app --reload --host $(API_HOST) --port $(API_PORT)

frontend:		## install deps + run Vite dev server
	cd $(FRONTEND) && npm install && npm run dev

data:			## download NOAA GOES data into data/raw
	$(PYTHON) scripts/download_data.py

train-nowcaster:
	$(PYTHON) scripts/train_nowcaster.py

train-forecaster:
	$(PYTHON) scripts/train_forecaster.py

test:			## run pytest suite
	$(PYTHON) -m pytest tests/ -v

lint:
	$(PYTHON) -m ruff check api pipeline scripts tests
	$(PYTHON) -m black --check api pipeline scripts tests

.PHONY: help install api frontend data train-nowcaster train-forecaster test lint
### ---------------------------------------------------
