#!/usr/bin/env bash
set -o errexit

# Instala as dependências do Node
npm install

# Define o diretório de cache do Puppeteer
export PUPPETEER_CACHE_DIR=/opt/render/project/.cache/puppeteer

# Cria a pasta de cache e instala o Chrome
mkdir -p $PUPPETEER_CACHE_DIR
npx puppeteer browsers install chrome
