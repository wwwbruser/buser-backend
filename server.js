const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(cors());

// ==========================================
// SUA CHAVE DA GECKOAPI AQUI:
// ==========================================
const GECKO_API_KEY = "pk_live_LxQWsRP6ZkPhKhlcesAtzoiWJ6GilfAN"; 

// Função para formatar a URL da ClickBus
function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros: origem, destino ou data.' });
  }

  console.log(`\n🔎 [Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  // ==========================================
  // 1. TENTATIVA GECKOAPI
  // ==========================================
  try {
    console.log(`⏳ Tentando GeckoAPI...`);
    // Nota: Se a URL da GeckoAPI for diferente, ajuste aqui.
    const response = await axios.get('https://api.geckoapi.com.br/v1/bus/search', {
      headers: { 'Authorization': `Bearer ${GECKO_API_KEY}` },
      params: { origem, destino, data },
      timeout: 8000 // 8 segundos máximo
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      console.log(`✅ [GeckoAPI] Sucesso! ${response.data.length} viagens.`);
      return res.json(response.data);
    }
  } catch (error) {
    console.log(`❌ [GeckoAPI] Falhou: ${error.response?.status || error.message}. Caindo para o Puppeteer...`);
  }

  // ==========================================
  // 2. TENTATIVA PUPPETEER (Plano B)
  // ==========================================
  let browser = null;
  try {
    console.log(`🤖 [Puppeteer] Iniciando navegador...`);
    
    // Flags para não travar o Render (limite de 512MB)
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Bloquear imagens e CSS (Deixa a busca muito mais rápida)
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    const origemSlug = slugify(origem);
    const destinoSlug = slugify(destino);
    const url = `https://www.clickbus.com.br/onibus/${origemSlug}-todos/${destinoSlug}-todos?departureDate=${data}`;
    
    console.log(`🤖 [Puppeteer] Navegando para: ${url}`);
    
    // Vai para a URL e espera o HTML principal carregar
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    
    // Espera 5 segundos para o site da ClickBus carregar os cards de viagens via JavaScript
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Tenta extrair os dados usando o texto da página
    const viagens = await page.evaluate(() => {
      const resultados = [];
      // Tenta buscar botões ou divs que contenham os preços
      const elements = document.querySelectorAll('div, button, article');
      
      // Esta é uma extração genérica. Pode precisar de ajuste fino dependendo do layout atual da ClickBus.
      elements.forEach(el => {
        const texto = el.innerText || '';
        // Se o texto tem "R$" e "Poltrona" ou é um card de viagem
        if (texto.includes('R$') && (texto.includes(':') || texto.toLowerCase().includes('leito') || texto.toLowerCase().includes('convencional'))) {
            // Evita pegar o card "pai" que contém todos os outros
            if (el.children.length > 0 && el.children[0].innerText?.includes('R$')) return;

            const linhas = texto.split('\n').filter(t => t.trim() !== '');
            if (linhas.length > 3 && linhas.length < 15) {
                // Procura o preço
                const precoMatch = texto.match(/R\$\s*([\d.,]+)/);
                // Procura horários (ex: 08:30)
                const horarios = texto.match(/(\d{2}:\d{2})/g);

                if (precoMatch && horarios && horarios.length >= 2) {
                    const preco = parseFloat(precoMatch[1].replace(/\./g, '').replace(',', '.'));
                    const empresa = linhas.find(l => l.length > 3 && !l.includes('R$') && !l.match(/\d{2}:\d{2}/) && !l.includes('Poltrona')) || 'Viação';

                    resultados.push({
                        company: { name: empresa.substring(0, 20) },
                        bus_type: texto.toLowerCase().includes('leito') ? 'Leito' : 'Convencional',
                        departure: { time: horarios[0], terminal: 'Rodoviária' },
                        arrival: { time: horarios[1], terminal: 'Rodoviária' },
                        price: preco,
                        total_seats: 46,
                        occupied_seats: [2, 5, 9] // Simulação de ocupadas
                    });
                }
            }
        }
      });

      // Remove duplicatas (mesma empresa, mesmo preço, mesmo horário)
      const unicos = [];
      const vistos = new Set();
      resultados.forEach(v => {
          const chave = `${v.company.name}-${v.departure.time}-${v.price}`;
          if (!vistos.has(chave)) {
              vistos.add(chave);
              unicos.push(v);
          }
      });

      return unicos;
    });

    await browser.close();

    if (viagens.length > 0) {
      console.log(`✅ [Puppeteer] ${viagens.length} viagens reais encontradas.`);
      return res.json(viagens);
    } else {
      console.log(`⚠️ [Puppeteer] Nenhuma viagem encontrada (pode ser bloqueio ou falta de horários).`);
      return res.json([]); 
    }

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ Erro crítico no Puppeteer:`, error.message);
    return res.status(500).json({ error: 'Falha ao buscar viagens. Servidor ocupado.' });
  }
});

// Rota para o UptimeRobot não deixar o servidor dormir
app.get('/', (req, res) => res.send('API Buser Online'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
