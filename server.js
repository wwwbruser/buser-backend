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

  console.log(`\n--- NOVA BUSCA ---`);
  console.log(`Origem: ${origem} | Destino: ${destino} | Data: ${data}`);

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros.' });
  }

  try {
    // 1. Separa a cidade e o estado (Ex: "São Paulo, SP" vira "Sao Paulo" e "SP")
    // Removemos acentos da cidade para evitar erro na API
    const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
    const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());

    const payload = {
      target: 'clickbus.com.br',
      type: 'plp',
      originCity: origemCidade.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), // "Sao Paulo"
      originState: origemUF,
      destinationCity: destinoCidade.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), // "Salvador"
      destinationState: destinoUF,
      departureDate: data,
      page: 1
    };

    console.log('Enviando para GekkoAPI:', JSON.stringify(payload));

    const response = await axios.post(
      'https://api.geckoapi.com.br/v1/extract',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${GEKKO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const json = response.data;

    // 2. Verifica se a GekkoAPI realmente não achou nada
    if (json.notFound === true || !json.data) {
      console.log('⚠️ GekkoAPI respondeu que não encontrou a rota (notFound: true).');
      return res.json({ data: [] });
    }

    // 3. Tenta extrair as viagens
    let viagens = [];
    if (Array.isArray(json.data)) {
      viagens = json.data;
    } else if (json.data && json.data.items) {
      viagens = json.data.items; // Formato comum da GekkoAPI
    } else if (json.data && json.data.data) {
      viagens = json.data.data;
    }

    console.log(`✅ Foram encontradas ${viagens.length} viagens.`);

    if (viagens.length === 0) {
      console.log('⚠️ A API retornou sucesso, mas a lista de viagens está vazia.');
      return res.json({ data: [] });
    }

    // 4. Formata os dados
    const viagensFormatadas = viagens.map(trip => {
      const nomeEmpresa = 
        trip.company?.name || 
        trip.busCompany?.name || 
        trip.empresa?.nome || 
        trip.empresa || 
        trip.operator?.name ||
        "Viação (Gekko)"; 

      return {
        id: trip.id || Math.random().toString(),
        company: { name: nomeEmpresa, logo: trip.company?.logo || "" },
        price: Number(trip.price || trip.preco || trip.valor || 0),
        bus_type: trip.bus_type || trip.tipo || "Convencional",
        total_seats: trip.total_seats || 46,
        occupied_seats: trip.occupied_seats || [],
        departure: {
          time: trip.departure?.time || trip.saida || "00:00",
          city: origemCidade,
          terminal: { name: trip.departure?.terminal?.name || trip.departure?.location?.name || "Terminal Principal" }
        },
        arrival: {
          time: trip.arrival?.time || trip.chegada || "00:00",
          city: destinoCidade,
          terminal: { name: trip.arrival?.terminal?.name || trip.arrival?.location?.name || "Terminal Principal" }
        }
      };
    });

    res.json({ data: viagensFormatadas });

  } catch (error) {
    console.error('❌ Erro na GekkoAPI:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Erro ao buscar viagens na Gekko', 
      detalhes: error.response?.data || error.message,
      data: [] 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
