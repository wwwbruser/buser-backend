const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');

const app = express();
app.use(cors());

let isBrowserBusy = false;

function slugify(text) {
  return text.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
}

// 🕵️‍♂️ CAÇADOR DE VIAGENS: Varre o JSON inteiro e acha o array que tem os preços
function encontrarArrayDeViagens(obj) {
    let melhorArray = [];
    
    function varrer(o) {
        if (Array.isArray(o)) {
            if (o.length > 0 && typeof o[0] === 'object') {
                // Se o array tem objetos que parecem viagens (têm preço ou horário ou serviceClass)
                if (o[0].price || o[0].preco || o[0].departureTime || o[0].serviceClass || o[0].company || o[0].empresa) {
                    if (o.length > melhorArray.length) melhorArray = o;
                }
            }
            o.forEach(item => varrer(item));
        } else if (o !== null && typeof o === 'object') {
            Object.values(o).forEach(val => varrer(val));
        }
    }
    varrer(obj);
    return melhorArray;
}

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });
  if (origem === 'ping' || destino === 'ping') return res.send('API Buser Online');

  console.log(`\n🔎 [Buscando]: ${origem} -> ${destino} | Data: ${data}`);

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
        headers: { 'Authorization': `Bearer ${geckoKey}`, 'Content-Type': 'application/json' },
        timeout: 45000
      });

      // Usa o caçador
      const viagensRaw = encontrarArrayDeViagens(response.data);

      if (viagensRaw && viagensRaw.length > 0) {
        console.log(`✅ [GeckoAPI] Caçador encontrou ${viagensRaw.length} viagens! Formatando...`);
        
        const viagensFormatadas = viagensRaw.map(v => {
          // Tenta achar a empresa
          const empresa = v.company?.name || v.empresa || v.operator?.name || v.transportCompany?.name || v.service?.company?.name || v.companyName || 'Viação';
          
          // Tenta achar o preço (olha em vários lugares possíveis)
          let precoRaw = v.price || v.preco || v.valor || v.ticket?.price || v.fares?.[0]?.price || v.fare?.price || v.minPrice || v.priceFrom || v.lowestPrice || 0;
          if (typeof precoRaw === 'object') precoRaw = precoRaw.amount || precoRaw.value || precoRaw.raw || 0;
          
          // Limpa o preço (se vier como string "R$ 150,00")
          if (typeof precoRaw === 'string') {
             precoRaw = precoRaw.replace(/[^\d.,]/g, '').replace(',', '.');
          }
          const preco = parseFloat(precoRaw) || 0;

          // Tenta achar horários
          const partida = v.departureTime || v.horarioSaida || v.departure?.time || v.boardingTime || v.time || '00:00';
          const chegada = v.arrivalTime || v.horarioChegada || v.arrival?.time || v.dropOffTime || '00:00';

          return {
            company: { name: empresa },
            bus_type: v.serviceClass?.name || v.busType || v.tipo || 'Convencional',
            departure: { time: partida, terminal: v.departure?.terminal?.name || 'Rodoviária' },
            arrival: { time: chegada, terminal: v.arrival?.terminal?.name || 'Rodoviária' },
            price: preco,
            total_seats: v.totalSeats || v.seats || 46,
            occupied_seats: [2, 5, 9]
          };
        }).filter(v => v.price > 0); // Só aceita se tiver preço maior que zero

        if (viagensFormatadas.length > 0) {
           console.log(`✅ [GeckoAPI] SUCESSO ABSOLUTO! ${viagensFormatadas.length} viagens prontas para o site.`);
           return res.json(viagensFormatadas);
        } else {
           console.log(`⚠️ [GeckoAPI] Os dados vieram, mas os preços não foram reconhecidos.`);
        }
      } else {
        console.log(`⚠️ [GeckoAPI] Nenhuma viagem retornada (Caçador não achou array válido).`);
      }
    } catch (error) {
      console.log(`❌ [GeckoAPI] Falhou: ${error.response?.status || error.message}.`);
    }
  }

  // --- PUPPETEER (Plano B) ---
  if (isBrowserBusy) return res.status(429).json({ error: 'Aguarde.' });
  isBrowserBusy = true;
  let browser = null;

  try {
    console.log(`🤖 [Puppeteer] Iniciando...`);
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => { ['image', 'font', 'media'].includes(req.resourceType()) ? req.abort() : req.continue(); });

    const url = `https://www.clickbus.com.br/onibus/${slugify(origem.split(',')[0])}-todos/${slugify(destino.split(',')[0])}-todos?departureDate=${data}`;
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 10000));

    const viagens = await page.evaluate(() => {
      const res = [];
      document.querySelectorAll('div, span, button').forEach(el => {
        const t = el.innerText || '';
        if (t.includes('R$') && /\d{2}:\d{2}/.test(t) && !(el.children.length > 2 && t.length > 250)) {
          const p = t.match(/R\$\s*([\d.,]+)/);
          const h = t.match(/(\d{2}:\d{2})/g);
          if (p && h && h.length >= 2) {
            const linha = t.split('\n').find(l => l.length > 3 && !l.includes('R$') && !l.match(/\d{2}:\d{2}/) && !l.includes('Poltrona')) || 'Viação';
            res.push({ company: {name: linha}, bus_type: 'Convencional', departure: {time: h[0], terminal: 'Rodoviária'}, arrival: {time: h[1], terminal: 'Rodoviária'}, price: parseFloat(p[1].replace(/\./g,'').replace(',', '.')), total_seats: 46, occupied_seats: [] });
          }
        }
      });
      return res;
    });

    if (viagens.length > 0) {
      console.log(`✅ [Puppeteer] ${viagens.length} viagens encontradas.`);
      return res.json(viagens);
    } else {
      console.log(`⚠️ [Puppeteer] Nenhuma viagem encontrada.`);
      return res.json([]);
    }
  } catch (e) {
    console.error(`❌ Erro no Puppeteer:`, e.message);
    return res.status(500).json({ error: 'Falha no robô.' });
  } finally {
    if (browser) await browser.close();
    isBrowserBusy = false;
  }
});

app.get('/', (req, res) => res.send('API Buser Online'));
app.listen(process.env.PORT || 10000, () => console.log(`🚀 Servidor rodando`));
