const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(cors());

// TRAVA DE SEGURANÇA: Impede que o Puppeteer abra 2 navegadores ao mesmo tempo e derrube o Render
let isBrowserBusy = false;

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

  // Ping para o UptimeRobot não deixar o servidor dormir
  if (origem === 'ping' || destino === 'ping') {
    return res.send('API Buser Online');
  }

  console.log(`\n🔎 [Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  // ==========================================
  // 1. TENTATIVA GECKOAPI (Rápida e Confiável)
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
        timeout: 45000 // CORREÇÃO AQUI: Aumentado de 15s para 45 segundos
      });

      const viagens = response.data.data || response.data;
      
      if (viagens && Array.isArray(viagens) && viagens.length > 0) {
        console.log(`✅ [GeckoAPI] Sucesso! ${viagens.length} viagens encontradas.`);
        
        // Padroniza os dados para o nosso front-end
        const viagensFormatadas = viagens.map(v => ({
          company: { name: v.company || v.empresa || 'Viação' },
          bus_type: v.busType || v.tipo || 'Convencional',
          departure: { time: v.departureTime || v.horarioSaida || '00:00', terminal: 'Rodoviária' },
          arrival: { time: v.arrivalTime || v.horarioChegada || '00:00', terminal: 'Rodoviária' },
          price: parseFloat(v.price || v.preco || 0),
          total_seats: v.totalSeats || 46,
          occupied_seats: [2, 5, 9] // Simulação para o mapa
        }));
        
        return res.json(viagensFormatadas);
      } else {
        console.log(`⚠️ [GeckoAPI] Nenhuma viagem retornada. Caindo para o Puppeteer...`);
      }
    } catch (error) {
      console.log(`❌ [GeckoAPI] Falhou: ${error.response?.status || error.message}. Caindo para o Puppeteer...`);
    }
  } else {
    console.log(`⚠️ [GeckoAPI] Chave não configurada no Render. Caindo para o Puppeteer...`);
  }

  // ==========================================
  // 2. TENTATIVA PUPPETEER (Plano B com Trava de Segurança)
  // ==========================================
  if (isBrowserBusy) {
    console.log(`⚠️ [Aviso] Puppeteer já está rodando. Recusando nova busca para não travar o servidor.`);
    return res.status(429).json({ error: 'Muitas buscas simultâneas. Aguarde alguns segundos e tente novamente.' });
  }

  isBrowserBusy = true; // Ativa a trava
  let browser = null;

  try {
    console.log(`🤖 [Puppeteer] Iniciando navegador ultra-leve...`);
    
    // Flags para não travar o Render (limite de 512MB)
    browser = await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 120000,
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
    
    // Bloquear imagens, CSS e fontes para economizar memória e tempo
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    const origemSlug = slugify(origem.split(',')[0]);
    const destinoSlug = slugify(destino.split(',')[0]);
    const url = `https://www.clickbus.com.br/onibus/${origemSlug}-todos/${destinoSlug}-todos?departureDate=${data}`;
    
    console.log(`🤖 [Puppeteer] Navegando para: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Espera 10 segundos para o React da ClickBus renderizar os preços na tela
    console.log(`⏳ [Puppeteer] Aguardando 10s para o site carregar os preços...`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Extrai os dados da tela
    const viagens = await page.evaluate(() => {
      const resultados = [];
      const elementos = document.querySelectorAll('div, span, p, button');
      
      elementos.forEach(el => {
        const texto = el.innerText || '';
        
        // Se o texto tem R$ e tem horário (ex: 08:30)
        if (texto.includes('R$') && /\d{2}:\d{2}/.test(texto)) {
          
          // Evita pegar o container pai que tem todos os textos juntos
          if (el.children.length > 2 && el.innerText.length > 250) return;

          const precoMatch = texto.match(/R\$\s*([\d.,]+)/);
          const horarios = texto.match(/(\d{2}:\d{2})/g);

          if (precoMatch && horarios && horarios.length >= 2) {
            const preco = parseFloat(precoMatch[1].replace(/\./g, '').replace(',', '.'));
            
            // Tenta achar o nome da empresa no texto
            const linhas = texto.split('\n');
            const empresa = linhas.find(l => l.length > 3 && !l.includes('R$') && !l.match(/\d{2}:\d{2}/) && !l.includes('Poltrona') && !l.includes('Escolher')) || 'Viação';

            resultados.push({
              company: { name: empresa.substring(0, 30) },
              bus_type: texto.toLowerCase().includes('leito') ? 'Leito' : (texto.toLowerCase().includes('executivo') ? 'Executivo' : 'Convencional'),
              departure: { time: horarios[0], terminal: 'Rodoviária' },
              arrival: { time: horarios[1], terminal: 'Rodoviária' },
              price: preco,
              total_seats: 46,
              occupied_seats: [2, 5, 9]
            });
          }
        }
      });

      // Remove duplicatas
      const unicos = [];
      const vistos = new Set();
      resultados.forEach(v => {
          const chave = `${v.company.name}-${v.departure.time}-${v.price}`;
          if (!vistos.has(chave)) { vistos.add(chave); unicos.push(v); }
      });
      return unicos;
    });

    if (viagens.length > 0) {
      console.log(`✅ [Puppeteer] SUCESSO! ${viagens.length} viagens reais encontradas.`);
      return res.json(viagens);
    } else {
      console.log(`⚠️ [Puppeteer] Nenhum preço encontrado na tela. A ClickBus pode ter bloqueado o robô.`);
      return res.json([]); 
    }

  } catch (error) {
    console.error(`❌ Erro crítico no Puppeteer:`, error.message);
    return res.status(500).json({ error: 'Falha ao buscar viagens no momento.' });
  } finally {
    // GARANTE que o navegador feche e a trava seja liberada
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
    isBrowserBusy = false; 
    console.log(`🤖 [Puppeteer] Processo finalizado e servidor liberado.`);
  }
});

// Rota principal para o UptimeRobot ver que o site está online
app.get('/', (req, res) => res.send('API Buser Online'));

const PORT = process.env.PORT || 10000;

// Inicia o servidor com timeouts estendidos para evitar erros de proxy no Render
const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

server.keepAliveTimeout = 120000; 
server.headersTimeout = 125000;
