const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 SUA CHAVE DE API DO SCRAPERAPI
const SCRAPER_API_KEY = "d793e70f21a22967eacd95419029258e";

// Rota de teste
app.get('/', (req, res) => {
  res.send('API Buser Online - ScraperAPI (Força Máxima)');
});

// Rota principal de busca
app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros.' });
  }

  try {
    const criarSlug = (cidadeString) => {
      const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
      const cidadeSlug = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-');
      return `${cidadeSlug}-${uf.toLowerCase()}`;
    };

    const origemSlug = criarSlug(origem);
    const destinoSlug = criarSlug(destino);

    console.log(`\n--- BUSCA CLICKBUS (ScraperAPI - Força Máxima) ---`);
    console.log(`Origem: ${origemSlug} | Destino: ${destinoSlug} | Data: ${data}`);

    // URL da API da ClickBus que queremos acessar
    const clickbusUrl = 'https://api.clickbus.com/api/v5/trips';
    
    // Chamada para o ScraperAPI com todos os parâmetros de força
    const response = await axios.get('https://api.scraperapi.com', {
      params: {
        api_key: SCRAPER_API_KEY,
        url: clickbusUrl,
        // Parâmetros da ClickBus (enviados como query string)
        from: `${origemSlug}-todos`,
        to: `${destinoSlug}-todos`,
        departureDate: data,
        clientId: 'buser-online-clone',
        
        // 🔥 FORÇA MÁXIMA:
        country_code: 'br', // Usar IPs do Brasil
        premium: 'true',    // Usar proxies residenciais (mais caro, mas passa bloqueios)
        render: 'true',     // Renderizar JS (caso a API dependa de JS)
        keep_headers: 'true'// Manter headers originais
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 60000 // Aumenta o timeout do Axios para 60 segundos
    });

    // O ScraperAPI retorna o conteúdo como string, então precisamos converter para JSON
    let json;
    try {
      json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      console.error('❌ ScraperAPI retornou algo que não é JSON:', response.data.substring(0, 500));
      throw new Error('Resposta inválida do ScraperAPI (não é JSON)');
    }

    let viagens = json.data || json.trips || [];
    if (!Array.isArray(viagens)) viagens = [];

    console.log(`✅ Foram encontradas ${viagens.length} viagens.`);

    // Formata os dados para o Frontend
    const viagensFormatadas = viagens.map(trip => {
      const nomeEmpresa = trip.company?.name || trip.travelCompany?.name || "Viação Parceira";
      
      // Lógica das poltronas aleatórias (35%)
      const totalAssentos = 46;
      const qtdOcupadas = Math.floor(totalAssentos * 0.35);
      const ocupadas = [];
      const seed = (trip.id || "1").toString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      for (let i = 1; i <= totalAssentos; i++) {
        if ((i * seed) % 10 < 3.5) ocupadas.push(i);
      }

      return {
        id: trip.id || Math.random().toString(),
        company: { 
          name: nomeEmpresa, 
          logo: trip.company?.logo || trip.travelCompany?.logo || "" 
        },
        price: Number(trip.price || trip.fare || 0),
        bus_type: trip.bus_type || trip.serviceClass || "Convencional",
        total_seats: totalAssentos,
        occupied_seats: ocupadas.slice(0, qtdOcupadas),
        departure: {
          time: trip.departure?.time || "--:--",
          city: origem.split(',')[0].trim(),
          terminal: { 
            name: trip.departure?.location?.name || trip.departure?.terminal?.name || "Terminal Principal", 
            address: trip.departure?.location?.address || "" 
          }
        },
        arrival: {
          time: trip.arrival?.time || "--:--",
          city: destino.split(',')[0].trim(),
          terminal: { 
            name: trip.arrival?.location?.name || trip.arrival?.terminal?.name || "Terminal Principal", 
            address: trip.arrival?.location?.address || "" 
          }
        }
      };
    });

    res.json({ data: viagensFormatadas });

  } catch (error) {
    console.error('❌ ERRO NA BUSCA (ScraperAPI):', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Erro ao buscar viagens', 
      detalhes: error.response?.data || error.message,
      data: [] 
    });
  }
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
