const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// 👇 COLOQUE SUA CHAVE DO GECKO AQUI (se tiver, senão deixe vazio)
const GECKO_API_KEY = process.env.GECKO_API_KEY || '';

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;
  console.log(`\n[Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  // 1. Tenta o GeckoAPI primeiro (se tiver chave)
  if (GECKO_API_KEY) {
    try {
      console.log("⏳ Tentando GeckoAPI...");
      const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
      const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());
      
      const response = await axios.post('https://api.geckoapi.com.br/v1/extract', {
        target: 'clickbus.com.br', type: 'plp', page: 1,
        originCity: origemCidade, originState: origemUF,
        destinationCity: destinoCidade, destinationState: destinoUF,
        departureDate: data
      }, {
        headers: { 'Authorization': `Bearer ${GECKO_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });

      const rawTrips = response.data?.data?.items || [];
      if (rawTrips.length > 0) {
        console.log(`✅ [GeckoAPI] ${rawTrips.length} viagens encontradas.`);
        return res.json(formatarViagensGecko(rawTrips));
      }
      console.log("⚠️ [GeckoAPI] Não achou viagens. Caindo para o Puppeteer...");
    } catch (error) {
      console.log(`❌ [GeckoAPI] Falhou: ${error.message}. Caindo para o Puppeteer...`);
    }
  }

  // 2. Fallback: Puppeteer (se o Gecko falhar)
  let browser;
  try {
    console.log("🤖 [Puppeteer] Iniciando navegador...");
    
    // Configuração blindada para o Render
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Essencial para o Render
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process' 
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const formatarCidade = (c) => {
      const limpa = c.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      return limpa.replace(/,\s*/g, '-').replace(/\s+/g, '-') + '-todos';
    };
    
    const url = `https://www.clickbus.com.br/onibus/${formatarCidade(origem)}/${formatarCidade(destino)}?departureDate=${data}`;
    console.log(`⏳ [Puppeteer] Navegando para: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

    // Aceita cookies
    try {
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.toLowerCase().includes('aceitar'));
        if (b) b.click();
      });
    } catch (e) {}

    await page.waitForFunction(() => document.body.innerText.includes('Viaje com'), { timeout: 45000 }).catch(() => {});

    // Rolagem
    let prev = 0;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
      const h = await page.evaluate(() => document.body.scrollHeight);
      if (h === prev) break;
      prev = h;
    }

    const textos = await page.evaluate(() => {
      const res = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.innerText && el.innerText.includes('R$') && el.innerText.includes('Viaje com') && el.children.length > 1) {
          const t = el.innerText.replace(/\n/g, ' | ');
          if (t.length > 20 && t.length < 600) res.push(t);
        }
      });
      return [...new Set(res)];
    });

    await browser.close();

    const viagens = [];
    const unicos = new Set();
    
    textos.forEach(bloco => {
      const limpo = bloco.replace(/\|/g, ' ').replace(/\+/g, ' ');
      const mEmp = limpo.match(/(Viaje com|Viagem com)\s+([A-Za-zÀ-ÿ0-9\s]+)/i);
      if (!mEmp) return;
      
      const empresa = mEmp[2].replace(/\s+/g, ' ').trim();
      const partes = bloco.split('|').map(p => p.trim());
      let t1 = -1, t2 = -1;
      
      for (let i = 0; i < partes.length; i++) {
        if (/^\d{2}:\d{2}$/.test(partes[i])) {
          if (t1 === -1) t1 = i; else if (t2 === -1) { t2 = i; break; }
        }
      }
      
      if (t1 === -1 || t2 === -1) return;
      
      const partida = partes[t1], chegada = partes[t2];
      const termP = partes[t1 + 1]?.length > 3 ? partes[t1 + 1] : 'Rodoviária';
      const termC = partes[t2 + 1]?.length > 3 ? partes[t2 + 1] : 'Rodoviária';
      
      const precos = limpo.match(/R\$\s*([\d.,]+)/g);
      let preco = 0;
      if (precos) preco = parseFloat(precos[precos.length - 1].replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
      
      let tipo = 'Convencional';
      if (bloco.includes('Cama')) tipo = 'Cama';
      else if (bloco.includes('Semi-leito')) tipo = 'Semi-leito';
      else if (bloco.includes('Leito')) tipo = 'Leito';
      else if (bloco.includes('Executivo')) tipo = 'Executivo';
      
      const id = `${empresa}-${partida}-${chegada}-${preco}`;
      if (preco > 0 && !unicos.has(id)) {
        unicos.add(id);
        viagens.push({ 
          company: { name: empresa }, 
          departure: { time: partida, terminal: termP }, 
          arrival: { time: chegada, terminal: termC }, 
          price: preco, 
          bus_type: tipo 
        });
      }
    });

    if (viagens.length > 0) {
      console.log(`✅ [Puppeteer] ${viagens.length} viagens reais formatadas.`);
      return res.json(viagens);
    } else {
      console.log(`⚠️ [Puppeteer] Não encontrou viagens.`);
      return res.json([]);
    }

  } catch (err) {
    console.error(`❌ Erro crítico: ${err.message}`);
    if (browser) await browser.close();
    return res.json([]);
  }
});

// Função auxiliar para formatar Gecko
function formatarViagensGecko(rawTrips) {
  return rawTrips.map(trip => ({
    company: { name: trip.travelCompany?.name || "Viação" },
    departure: {
      time: trip.departure?.time || "--:--",
      terminal: trip.departure?.place?.terminal || "Rodoviária",
      address: trip.departure?.place?.terminalAddress || ""
    },
    arrival: {
      time: trip.arrival?.time || "--:--",
      terminal: trip.arrival?.place?.terminal || "Rodoviária",
      address: trip.arrival?.place?.terminalAddress || ""
    },
    price: trip.discountedPrice || trip.price || 0,
    bus_type: trip.serviceClass?.name || "Convencional"
  }));
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Servidor rodando na porta ${process.env.PORT || 3000}`);
});
