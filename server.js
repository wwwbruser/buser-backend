const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros: origem, destino ou data.' });
  }

  // Se for o ping do UptimeRobot, retorna logo
  if (origem === 'ping' || destino === 'ping') {
    return res.send('pong');
  }

  console.log(`\n🔎 [Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  // ==========================================
  // 1. TENTATIVA GECKOAPI
  // ==========================================
  const geckoKey = process.env.GECKO_API_KEY;

  if (geckoKey) {
    try {
      console.log(`⏳ Tentando GeckoAPI...`);
      const [origemCidade, origemEstado] = origem.split(',').map(s => s.trim());
      const [destinoCidade, destinoEstado] = destino.split(',').map(s => s.trim());

      const response = await axios.post('https://api.geckoapi.com.br/v1/extract', {
        target: 'clickbus.com.br',
        type: 'plp',
        originCity: origemCidade,
        originState: origemEstado,
        destinationCity: destinoCidade,
        destinationState: destinoEstado,
        departureDate: data,
        page: 1
      }, {
        headers: {
          'Authorization': `Bearer ${geckoKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 segundos
      });

      const viagens = response.data.data || response.data;
      
      if (viagens && Array.isArray(viagens) && viagens.length > 0) {
        console.log(`✅ [GeckoAPI] Sucesso! ${viagens.length} viagens.`);
        
        // Padroniza os dados para o nosso front-end
        const viagensFormatadas = viagens.map(v => ({
          company: { name: v.company || v.empresa || 'Viação' },
          bus_type: v.busType || v.tipo || 'Convencional',
          departure: { time: v.departureTime || v.horarioSaida || '00:00', terminal: 'Rodoviária' },
          arrival: { time: v.arrivalTime || v.horarioChegada || '00:00', terminal: 'Rodoviária' },
          price: parseFloat(v.price || v.preco || 0),
          total_seats: v.totalSeats || 46,
          occupied_seats: [2, 5, 9]
        }));
        return res.json(viagensFormatadas);
      } else {
        console.log(`⚠️ [GeckoAPI] Nenhuma viagem para esta data.`);
        return res.json([]);
      }
    } catch (error) {
      console.log(`❌ [GeckoAPI] Falhou: ${error.response?.status || error.message}. Caindo para o Puppeteer...`);
    }
  }

  // ==========================================
  // 2. TENTATIVA PUPPETEER (Otimizada para o Render)
  // ==========================================
  let browser = null;
  try {
    console.log(`🤖 [Puppeteer] Iniciando navegador...`);
    
    // Flag --single-process REMOVIDA (era o que causava o erro Network.enable)
    // protocolTimeout aumentado para evitar timeout na comunicação com o Chrome
    browser = await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 120000, // 2 minutos
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Bloqueia imagens, CSS e fontes para economizar memória e tempo
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    function slugify(text) {
      return text.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
    }

    const origemSlug = slugify(origem.split(',')[0]);
    const destinoSlug = slugify(destino.split(',')[0]);
    const url = `https://www.clickbus.com.br/onibus/${origemSlug}-todos/${destinoSlug}-todos?departureDate=${data}`;
    
    console.log(`🤖 [Puppeteer] Navegando para: ${url}`);
    
    // Aumentei o timeout para 60s e mudei para networkidle2 (espera a rede acalmar)
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Espera mais 5 segundos para garantir que o React renderizou os preços
    await new Promise(resolve => setTimeout(resolve, 5000));

    const viagens = await page.evaluate(() => {
      const resultados = [];
      const elements = document.querySelectorAll('div, button, article');
      
      elements.forEach(el => {
        const texto = el.innerText || '';
        if (texto.includes('R$') && (texto.includes(':') || texto.toLowerCase().includes('leito') || texto.toLowerCase().includes('convencional'))) {
            if (el.children.length > 0 && el.children[0].innerText?.includes('R$')) return;

            const linhas = texto.split('\n').filter(t => t.trim() !== '');
            if (linhas.length > 3 && linhas.length < 15) {
                const precoMatch = texto.match(/R\$\s*([\d.,]+)/);
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
                        occupied_seats: [2, 5, 9]
                    });
                }
            }
        }
      });

      // Remove duplicatas
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

    if (viagens.length > 0) {
      console.log(`✅ [Puppeteer] ${viagens.length} viagens reais encontradas.`);
      return res.json(viagens);
    } else {
      console.log(`⚠️ [Puppeteer] Nenhuma viagem encontrada.`);
      return res.json([]); 
    }

  } catch (error) {
    console.error(`❌ Erro crítico no Puppeteer:`, error.message);
    return res.status(500).json({ error: 'Falha ao buscar viagens.' });
  } finally {
    // GARANTE que o navegador feche para não travar o Render
    if (browser) {
      await browser.close();
      console.log(`🤖 [Puppeteer] Navegador fechado.`);
    }
  }
});

// Rota para o UptimeRobot
app.get('/', (req, res) => res.send('API Buser Online'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
