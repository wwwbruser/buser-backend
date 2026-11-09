#!/usr/bin/env bash
# Para o script se houver qualquer erro
set -o errexit

# Instala as dependências do Node
npm install

# Define o diretório de cache do Puppeteer dentro do projeto
export PUPPETEER_CACHE_DIR=/opt/render/project/.cache/puppeteer

# Cria a pasta de cache
mkdir -p $PUPPETEER_CACHE_DIR

# Instala o Chrome
npx puppeteer browsers install chrome
