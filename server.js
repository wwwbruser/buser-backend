const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ COLOQUE O SEU TOKEN DA GEKKOAPI AQUI (Entre as aspas)
// Pode ser o token que você já usava ou a chave gerada no painel da GekkoAPI.
const GEKKO_API_KEY = "pk_live_hMefqko4aIEWJGgZpRMxXgnnpsUS9OPh"; 

app.get('/', (req, res) => {
  res.send('API Buser Online - GekkoAPI Conectada');
});

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros: origem, destino ou data.' });
  }

  try {
    // 1. Separa a cidade e o estado (UF) da string "São Paulo, SP"
    const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
    const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());

    // 2. Requisição para o endpoint correto da GekkoAPI (POST /v1/extract)
    const response = await axios.post(
      'https://api.geckoapi.com.br/v1/extract',
      {
        target: 'clickbus.com.br',
        type: 'plp',
        originCity: origemCidade,
        originState: origemUF,
        destinationCity: destinoCidade,
        destinationState: destinoUF,
        departureDate: data, // Formato YYYY-MM-DD
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
    
    // 3. Trata a resposta (incluindo o caso de "não encontrado" da GekkoAPI)
    // A API pode retornar { data: null, notFound: true } se não houver viagens.
    let viagens = [];
    if (json.notFound === true || !json.data) {
      console.log('GekkoAPI: Nenhuma viagem encontrada para esta rota/data.');
      viagens = [];
    } else if (Array.isArray(json.data)) {
      viagens = json.data;
    } else if (json.data && json.data.data && Array.isArray(json.data.data)) {
      viagens = json.data.data;
    }

    // 4. Formata os dados para o Frontend
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

    // 5. Retorna os dados (mesmo que vazios, o frontend sabe lidar)
    res.json({ data: viagensFormatadas });

  } catch (error) {
    console.error('Erro na GekkoAPI:', error.response?.data || error.message);
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
