const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ COLOQUE O SEU TOKEN DA GEKKOAPI AQUI
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
    // Separa a cidade e o estado
    const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
    const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());

    console.log(`\n--- BUSCA ---`);
    console.log(`Origem: ${origemCidade}-${origemUF} | Destino: ${destinoCidade}-${destinoUF} | Data: ${data}`);

    // Requisição para a GekkoAPI usando o endpoint padrão da ClickBus
    const response = await axios.post(
      'https://api.geckoapi.com.br/v1/extract',
      {
        target: 'clickbus.com.br',
        type: 'plp',
        originCity: origemCidade,
        originState: origemUF,
        destinationCity: destinoCidade,
        destinationState: destinoUF,
        departureDate: data,
        page: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${GEKKO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const json = response.data;

    // Verifica se a API achou viagens
    let viagens = [];
    if (json.data && Array.isArray(json.data)) {
      viagens = json.data;
    } else if (json.data && json.data.items) {
      viagens = json.data.items;
    }

    console.log(`✅ Foram encontradas ${viagens.length} viagens.`);

    if (viagens.length === 0) {
      return res.json({ data: [] });
    }

    // Formata os dados para o seu Frontend
    const viagensFormatadas = viagens.map(trip => {
      return {
        id: trip.id || Math.random().toString(),
        company: { 
          name: trip.company?.name || trip.empresa?.nome || "Viação", 
          logo: trip.company?.logo || "" 
        },
        price: Number(trip.price || trip.preco || 0),
        bus_type: trip.bus_type || "Convencional",
        total_seats: 46,
        occupied_seats: [],
        departure: {
          time: trip.departure?.time || "--:--",
          city: origemCidade,
          terminal: { name: trip.departure?.terminal?.name || "Terminal Principal" }
        },
        arrival: {
          time: trip.arrival?.time || "--:--",
          city: destinoCidade,
          terminal: { name: trip.arrival?.terminal?.name || "Terminal Principal" }
        }
      };
    });

    res.json({ data: viagensFormatadas });

  } catch (error) {
    // 🔥 O ERRO VAI APARECER AQUI NO LOG DO RENDER
    console.error('❌ ERRO NA GEKKOAPI:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Erro ao buscar viagens', 
      detalhes: error.response?.data || error.message,
      data: [] 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
