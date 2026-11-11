// ==========================================
// SERVER.JS - BACKEND RENDER
// ==========================================
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilita CORS para o seu frontend (HTML) poder fazer requisições
app.use(cors());
app.use(express.json());

// Sua chave da GekkoAPI (se precisar, configure no painel Environment do Render)
const GEKKO_API_KEY = process.env.GEKKO_API_KEY || "SUA_CHAVE_GEKKO_AQUI";

// Rota de busca
app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Parâmetros origem, destino e data são obrigatórios.' });
  }

  try {
    // 1. Faz a requisição para a GekkoAPI (ajuste a URL se necessário)
    // Nota: Substitua a URL abaixo pela URL real da GekkoAPI que você usa.
    const urlGekko = `https://api.geckoapi.com.br/v1/transport/search`;
    
    const response = await axios.get(urlGekko, {
      params: {
        origin: origem,
        destination: destino,
        date: data,
        // Adicione outros parâmetros que sua API exija
      },
      headers: {
        'Authorization': `Bearer ${GEKKO_API_KEY}`,
        'Accept': 'application/json'
      }
    });

    const json = response.data;
    
    // 2. Extrai o array de viagens (lida com vários formatos de resposta)
    let viagensCruas = [];
    if (Array.isArray(json)) {
      viagensCruas = json;
    } else if (json.data && Array.isArray(json.data)) {
      viagensCruas = json.data;
    } else if (json.data && json.data.data && Array.isArray(json.data.data)) {
      viagensCruas = json.data.data;
    } else if (json.viagens && Array.isArray(json.viagens)) {
      viagensCruas = json.viagens;
    } else if (json.results && Array.isArray(json.results)) {
      viagensCruas = json.results;
    }

    // 3. 🔥 NORMALIZAÇÃO (A MÁGICA ACONTECE AQUI)
    const viagensFormatadas = viagensCruas.map(trip => {
      
      // --- NOME DA EMPRESA ---
      const nomeEmpresa = 
        trip.company?.name || 
        trip.busCompany?.name || 
        trip.operator?.name || 
        trip.empresa?.nome || 
        trip.empresa || 
        (typeof trip.company === 'string' ? trip.company : null) ||
        "Viação Padrão";

      // --- CIDADE DE ORIGEM ---
      const cidadeOrigem = 
        trip.departure?.location?.city?.name ||
        trip.departure?.city?.name ||
        trip.departure?.city ||
        trip.origin?.city ||
        origem.split(',')[0];

      // --- CIDADE DE DESTINO ---
      const cidadeDestino = 
        trip.arrival?.location?.city?.name ||
        trip.arrival?.city?.name ||
        trip.arrival?.city ||
        trip.destination?.city ||
        destino.split(',')[0];

      // --- TERMINAL DE ORIGEM ---
      const terminalOrigem = 
        trip.departure?.location?.name || 
        trip.departure?.terminal?.name || 
        trip.departure?.station?.name || 
        trip.origin?.name || 
        "";

      // --- TERMINAL DE DESTINO ---
      const terminalDestino = 
        trip.arrival?.location?.name || 
        trip.arrival?.terminal?.name || 
        trip.arrival?.station?.name || 
        trip.destination?.name || 
        "";

      // --- PREÇO ---
      let preco = 0;
      if (typeof trip.price === 'number') preco = trip.price;
      else if (typeof trip.price === 'string') preco = parseFloat(trip.price);
      else if (trip.price?.value) preco = parseFloat(trip.price.value);
      else if (trip.preco) preco = parseFloat(trip.preco);
      else if (trip.valor) preco = parseFloat(trip.valor);
      else if (trip.amount) preco = parseFloat(trip.amount);

      // --- TIPO DE ÔNIBUS ---
      const tipoOnibus = 
        trip.bus_type || 
        trip.busType || 
        trip.service_class || 
        trip.serviceClass || 
        trip.categoria || 
        "Convencional";

      // --- HORÁRIOS ---
      const horaSaida = trip.departure?.time || trip.departureTime || trip.departure_time || "--:--";
      const horaChegada = trip.arrival?.time || trip.arrivalTime || trip.arrival_time || "--:--";

      // Retorna o objeto limpo para o frontend
      return {
        id: trip.id || Math.random().toString(36).substring(7),
        company: {
          name: nomeEmpresa,
          logo: trip.company?.logo || trip.companyLogo || ""
        },
        bus_type: tipoOnibus,
        price: preco,
        total_seats: trip.total_seats || trip.totalSeats || trip.assentos || 46,
        occupied_seats: trip.occupied_seats || trip.occupiedSeats || trip.assentos_ocupados || [],
        departure: {
          time: horaSaida,
          city: cidadeOrigem,
          terminal: {
            name: terminalOrigem,
            address: trip.departure?.location?.address || trip.departure?.terminal?.address || "",
            city: cidadeOrigem
          }
        },
        arrival: {
          time: horaChegada,
          city: cidadeDestino,
          terminal: {
            name: terminalDestino,
            address: trip.arrival?.location?.address || trip.arrival?.terminal?.address || "",
            city: cidadeDestino
          }
        }
      };
    });

    // 4. Retorna os dados limpos e formatados
    return res.json({ data: viagensFormatadas });

  } catch (error) {
    console.error('Erro na busca:', error.message);
    return res.status(500).json({ 
      error: 'Erro ao buscar viagens', 
      details: error.response?.data || error.message 
    });
  }
});

// Rota de teste para ver se o servidor está online
app.get('/', (req, res) => {
  res.send('API Buser Online - OK');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
