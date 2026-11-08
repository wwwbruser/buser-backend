const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// Rota principal de busca
app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;
  
  if (!origem || !destino || !data) {
    return res.status(400).json({ erro: 'Faltam parâmetros.' });
  }

  // Formata as cidades para o padrão da URL da ClickBus (ex: "Salvador, BA" -> "salvador-ba-todos")
  const formatarCidade = (cidade) => {
    if (cidade.includes('-todos')) return cidade;
    const limpa = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const formatada = limpa.replace(/,\s*/g, '-').replace(/\s+/g, '-');
    return `${formatada}-todos`;
  };

  const from = formatarCidade(origem);
  const to = formatarCidade(destino);
  const url = `https://www.clickbus.com.br/onibus/${from}/${to}?departureDate=${data}`;
  
  console.log(`\n[Buscando com Puppeteer]: ${origem} -> ${destino} | Data: ${data}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Importante para o Render
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process' // Pode ajudar no Render
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("⏳ Navegando para o site da ClickBus...");
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

    // Aceita os cookies se aparecer o pop-up
    try {
      await page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button'));
        const btnAceitar = botoes.find(b => b.textContent.toLowerCase().includes('aceitar'));
        if (btnAceitar) btnAceitar.click();
      });
    } catch (e) {}

    console.log("⏳ Esperando as viagens carregarem...");
    try {
      await page.waitForFunction(() => document.body.innerText.includes('Viaje com'), { timeout: 45000 });
      console.log("✅ Cards de viagem encontrados na tela!");
    } catch (e) {
      console.log("⚠️ Tempo esgotado esperando 'Viaje com'. Tentando ler mesmo assim...");
    }

    // Rola a página para carregar todas as viagens
    console.log("⏳ Rolando a página para carregar TODAS as viagens...");
    let previousHeight = 0;
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2500));
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) break;
      previousHeight = newHeight;
    }

    // Extrai todo o texto da página
    const textosAchados = await page.evaluate(() => {
      const resultados = [];
      const todosElementos = Array.from(document.querySelectorAll('*'));
      todosElementos.forEach(el => {
        if (el.innerText && el.innerText.includes('R$') && el.innerText.includes('Viaje com') && el.children.length > 1) {
          const texto = el.innerText.replace(/\n/g, ' | ');
          if (texto.length > 20 && texto.length < 600) resultados.push(texto);
        }
      });
      return [...new Set(resultados)];
    });

    await browser.close();

    // Formata os dados para o frontend
    const viagensFormatadas = [];
    const viagensUnicas = new Set();

    textosAchados.forEach(bloco => {
      const textoLimpo = bloco.replace(/\|/g, ' ').replace(/\+/g, ' ');

      let empresa = "Viação";
      const matchEmpresa = textoLimpo.match(/(Viaje com|Viagem com)\s+([A-Za-zÀ-ÿ0-9\s]+)/i);
      if (matchEmpresa && matchEmpresa[2]) empresa = matchEmpresa[2].replace(/\s+/g, ' ').trim();
      else return;

      const partes = bloco.split('|').map(p => p.trim());
      let time1_idx = -1, time2_idx = -1;
      
      for (let i = 0; i < partes.length; i++) {
        if (/^\d{2}:\d{2}$/.test(partes[i])) {
          if (time1_idx === -1) time1_idx = i;
          else if (time2_idx === -1) { time2_idx = i; break; }
        }
      }

      let partida = "--:--", chegada = "--:--";
      let terminalPartida = "Rodoviária", terminalChegada = "Rodoviária";

      if (time1_idx !== -1 && time2_idx !== -1) {
        partida = partes[time1_idx];
        chegada = partes[time2_idx];

        if (partes[time1_idx + 1] && partes[time1_idx + 1].length > 3 && !partes[time1_idx + 1].includes('h')) {
          terminalPartida = partes[time1_idx + 1]; 
        } else if (partes[time1_idx + 2] && partes[time1_idx + 2].length > 3) {
          terminalPartida = partes[time1_idx + 2];
        }

        if (partes[time2_idx + 1] && partes[time2_idx + 1].length > 3) {
          terminalChegada = partes[time2_idx + 1];
        }
      }

      const precos = textoLimpo.match(/R\$\s*([\d.,]+)/g);
      let preco = 0;
      if (precos && precos.length > 0) {
        const precoStr = precos[precos.length - 1].replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        preco = parseFloat(precoStr) || 0;
      }

      let tipo = "Convencional";
      if (bloco.includes('Cama')) tipo = "Cama";
      else if (bloco.includes('Semi-leito')) tipo = "Semi-leito";
      else if (bloco.includes('Leito')) tipo = "Leito";
      else if (bloco.includes('Executivo')) tipo = "Executivo";

      const idUnico = `${empresa}-${partida}-${chegada}-${preco}`;
      if (preco > 0 && partida !== "--:--" && !viagensUnicas.has(idUnico)) {
        viagensUnicas.add(idUnico);
        viagensFormatadas.push({
          company: { name: empresa },
          departure: { time: partida, terminal: terminalPartida },
          arrival: { time: chegada, terminal: terminalChegada },
          price: preco,
          bus_type: tipo
        });
      }
    });

    if (viagensFormatadas.length > 0) {
      console.log(`✅ SUCESSO! ${viagensFormatadas.length} viagens reais formatadas.`);
      return res.json(viagensFormatadas);
    } else {
      console.log(`⚠️ Tela carregou, mas nenhuma viagem foi encontrada.`);
      return res.json([]);
    }

  } catch (error) {
    console.error(`❌ Erro crítico: ${error.message}`);
    if (browser) await browser.close();
    return res.json([]);
  }
});

// Inicia o servidor
app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Servidor rodando na porta ${process.env.PORT || 3000}`);
});
