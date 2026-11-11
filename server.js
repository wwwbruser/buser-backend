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
    const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
    const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());

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
    let viagens = [];
    if (json.data && Array.isArray(json.data)) viagens = json.data;
    else if (json.data && json.data.items) viagens = json.data.items;

    const viagensFormatadas = viagens.map(trip => {
      const nomeEmpresa = 
        trip.travelCompany?.name || 
        trip.company?.name || 
        trip.busCompany?.name || 
        "Viação Parceira";

      // 🔥 LÓGICA DAS POLTRONAS OCUPADAS (35%)
      const totalAssentos = 46;
      const qtdOcupadas = Math.floor(totalAssentos * 0.35); // 35% de 46 = 16 poltronas
      const ocupadas = [];
      
      // Sorteia as poltronas baseado no ID da viagem (para ser fixo por viagem)
      const seed = (trip.id || "1").toString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      for (let i = 1; i <= totalAssentos; i++) {
        if ((i * seed) % 10 < 3.5) { 
          ocupadas.push(i);
        }
      }

      return {
        id: trip.id || Math.random().toString(),
        company: { 
          name: nomeEmpresa, 
          logo: trip.travelCompany?.logo || trip.company?.logo || "" 
        },
        price: Number(trip.price || trip.preco || 0),
        bus_type: trip.bus_type || "Convencional",
        total_seats: totalAssentos,
        occupied_seats: ocupadas.slice(0, qtdOcupadas), // Envia as poltronas para o Frontend
        departure: {
          time: trip.departure?.time || "--:--",
          city: origemCidade,
          terminal: { 
            name: trip.departure?.place?.name || trip.departure?.terminal?.name || "Terminal Principal", 
            address: trip.departure?.place?.address || "" 
          }
        },
        arrival: {
          time: trip.arrival?.time || "--:--",
          city: destinoCidade,
          terminal: { 
            name: trip.arrival?.place?.name || trip.arrival?.terminal?.name || "Terminal Principal", 
            address: trip.arrival?.place?.address || "" 
          }
        }
      };
    });

    res.json({ data: viagensFormatadas });

  } catch (error) {
    console.error('❌ ERRO NA GEKKOAPI:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao buscar viagens', data: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
