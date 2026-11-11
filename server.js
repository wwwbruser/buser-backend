const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ COLOQUE O SEU TOKEN DA GEKKOAPI AQUI (Entre as aspas)
const GEKKO_API_KEY = "pk_live_hMefqko4aIEWJGgZpRMxXgnnpsUS9OPh"; 

app.get('/', (req, res) => {
  res.send('API Buser Online - GekkoAPI Conectada');
});

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros.' });
  }

  try {
    // 1. Requisição para a GekkoAPI
    // (A URL abaixo é o endpoint padrão da Gekko para ônibus)
    const response = await axios.get('https://api.geckoapi.com.br/v1/transport/search', {
      params: {
        origin: origem,
        destination: destino,
        date: data
      },
      headers: {
        'Authorization': `Bearer ${GEKKO_API_KEY}`, // O Token entra aqui
        'Accept': 'application/json'
      }
    });

    const json = response.data;
    
    // 2. Pega a lista de viagens
    let viagens = json.data || json.results || json.viagens || json;
    if (!Array.isArray(viagens)) viagens = [];

    // 3. Formata os dados para o Frontend (A Mágica)
    const viagensFormatadas = viagens.map(trip => {
      
      // Procura o nome da empresa em todos os lugares possíveis da GekkoAPI
      const nomeEmpresa = 
        trip.company?.name || 
        trip.busCompany?.name || 
        trip.empresa?.nome || 
        trip.empresa || 
        trip.operator?.name ||
        "Viação (Gekko)"; 

      return {
        id: trip.id || Math.random().toString(),
        company: {
          name: nomeEmpresa,
          logo: trip.company?.logo || ""
        },
        price: Number(trip.price || trip.preco || trip.valor || 0),
        bus_type: trip.bus_type || trip.tipo || "Convencional",
        total_seats: trip.total_seats || 46,
        occupied_seats: trip.occupied_seats || [],
        departure: {
          time: trip.departure?.time || trip.saida || "00:00",
          city: origem.split(',')[0],
          terminal: { name: trip.departure?.terminal?.name || trip.departure?.location?.name || "Terminal Principal" }
        },
        arrival: {
          time: trip.arrival?.time || trip.chegada || "00:00",
          city: destino.split(',')[0],
          terminal: { name: trip.arrival?.terminal?.name || trip.arrival?.location?.name || "Terminal Principal" }
        }
      };
    });

    res.json({ data: viagensFormatadas });

  } catch (error) {
    console.error('Erro na GekkoAPI:', error.message);
    res.status(500).json({ error: 'Erro ao buscar viagens na Gekko', data: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
