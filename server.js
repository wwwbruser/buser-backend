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

function encontrarArrayDeViagens(obj) {
    let melhorArray = [];
    function varrer(o) {
        if (Array.isArray(o)) {
            if (o.length > 0 && typeof o[0] === 'object') {
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

function acharNomeEmpresa(v) {
    const possiveis = [
        v.company?.name, v.empresa, v.operator?.name, v.transportCompany?.name, 
        v.service?.company?.name, v.companyName, v.brand, v.carrier?.name,
        v.trip?.company?.name, v.legs?.[0]?.company?.name, v.legs?.[0]?.operator?.name
    ];
    for (let nome of possiveis) {
        if (nome && typeof nome === 'string' && nome.trim().length > 2) return nome.trim();
    }
    return 'Viação';
}

// 🕵️‍♂️ CAÇADOR DE TERMINAIS COM A TESOURA MÁGICA
function extrairTerminalBackend(v, tipo) {
    let t = v[tipo]?.terminal || v[tipo]?.location || v[tipo]?.station || v[tipo]?.place || v[tipo]?.stop || 
            v.legs?.[0]?.[tipo]?.terminal || v.legs?.[0]?.[tipo]?.location || v.trip?.[tipo]?.terminal;

    if (!t) return { name: 'Rodoviária', address: '' };
    if (typeof t === 'string') return { name: t, address: '' };

    let name = t.name || t.nome || t.terminal || t.title || t.label || 'Rodoviária';
    
    let address = '';
    const endCandidatos = [
        t.address, t.endereco, t.full_address, t.address_line,
        t.location?.address, t.location?.endereco, t.place?.address
    ];
    for (let c of endCandidatos) {
        if (c && typeof c === 'string' && c.trim()) { address = c.trim(); break; }
    }

    if (address) {
        // ✂️ TESOURA: Remove telefone e CEP do final do endereço
        address = address.replace(/\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/g, '');
        address = address.replace(/\d{5}-\d{3}/g, '');
        address = address.replace(/[,\-\s]+$/, '').trim();
        if (!address) address = 'Consulte no embarque';
    }

    return { name, address };
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

      const viagensRaw = encontrarArrayDeViagens(response.data);

      if (viagensRaw && viagensRaw.length > 0) {
        console.log(`✅ [GeckoAPI] Caçador encontrou ${viagensRaw.length} viagens! Formatando...`);
        
        const viagensFormatadas = viagensRaw.map(v => {
          const empresa = acharNomeEmpresa(v);
          
          let precoRaw = v.price || v.preco || v.valor || v.ticket?.price || v.fares?.[0]?.price || v.fare?.price || v.minPrice || v.priceFrom || v.lowestPrice || 0;
          if (typeof precoRaw === 'object') precoRaw = precoRaw.amount || precoRaw.value || precoRaw.raw || 0;
          if (typeof precoRaw === 'string') precoRaw = precoRaw.replace(/[^\d.,]/g, '').replace(',', '.');
          const preco = parseFloat(precoRaw) || 0;

          const partida = v.departureTime || v.horarioSaida || v.departure?.time || v.boardingTime || v.time || '00:00';
          const chegada = v.arrivalTime || v.horarioChegada || v.arrival?.time || v.dropOffTime || '00:00';

          const termPartidaObj = extrairTerminalBackend(v, 'departure');
          const termChegadaObj = extrairTerminalBackend(v, 'arrival');

          return {
            company: { name: empresa },
            bus_type: v.serviceClass?.name || v.busType || v.tipo || 'Convencional',
            departure: { time: partida, terminal: termPartidaObj },
            arrival: { time: chegada, terminal: termChegadaObj },
            price: preco,
            total_seats: v.totalSeats || v.seats || 46,
            occupied_seats: [2, 5, 9]
          };
        }).filter(v => v.price > 0);

        if (viagensFormatadas.length > 0) {
           console.log(`✅ [GeckoAPI] SUCESSO! ${viagensFormatadas.length} viagens prontas.`);
           return res.json(viagensFormatadas);
        }
      }
    } catch (error) {
      console.log(`❌ [GeckoAPI] Falhou: ${error.response?.status || error.message}.`);
    }
  }

  // PUPPETEER (Plano B)
  if (isBrowserBusy) return res.status(429).json({ error: 'Aguarde.' });
  isBrowserBusy = true;
  let browser = null;

  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
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
            res.push({ company: {name: linha}, bus_type: 'Convencional', departure: {time: h[0], terminal: {name: 'Rodoviária', address: ''}}, arrival: {time: h[1], terminal: {name: 'Rodoviária', address: ''}}, price: parseFloat(p[1].replace(/\./g,'').replace(',', '.')), total_seats: 46, occupied_seats: [] });
          }
        }
      });
      return res;
    });

    return res.json(viagens.length > 0 ? viagens : []);
  } catch (e) {
    return res.status(500).json({ error: 'Falha no robô.' });
  } finally {
    if (browser) await browser.close();
    isBrowserBusy = false;
  }
});

app.get('/', (req, res) => res.send('API Buser Online'));
app.listen(process.env.PORT || 10000, () => console.log(`🚀 Servidor rodando`));
