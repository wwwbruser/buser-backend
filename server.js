const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// AQUI ESTÁ A CORREÇÃO DO CORS PARA O SITE CONSEGUIR LER
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(__dirname));

const GECKO_API_KEY = 'pk_live_WA8Am7Nhkxo53FDosrtrW2_B9GbM3w6A'; 

try {
  admin.initializeApp({ projectId: 'buser202872a' });
} catch (e) {}
const db = admin.firestore();

// ROTA DE BUSCA (Puxando GeckoAPI e formatando certinho)
app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;
  console.log(`\n[Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  try {
    const origemParts = origem.split(',').map(s => s.trim());
    const destinoParts = destino.split(',').map(s => s.trim());
    
    const payload = {
      target: 'clickbus.com.br',
      type: 'plp',
      page: 1,
      originCity: origemParts[0],
      originState: origemParts[1] || 'SP',
      destinationCity: destinoParts[0],
      destinationState: destinoParts[1] || 'SP',
      departureDate: data
    };

    const response = await axios.post('https://api.geckoapi.com.br/v1/extract', payload, {
      headers: { 'Authorization': `Bearer ${GECKO_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    // Pega a lista de viagens que vem dentro de "results"
    let viagens = [];
    if (response.data && response.data.results) {
      viagens = response.data.results;
    } else if (Array.isArray(response.data)) {
      viagens = response.data;
    }

    console.log(`SUCESSO! ${viagens.length} viagens encontradas.`);
    res.json(viagens); 
    
  } catch (error) {
    console.error("Erro Gecko:", error.response ? error.response.data : error.message);
    res.json([]); // Retorna vazio se der erro, pra não travar o site
  }
});

// ROTA DO PIX (BlackCat)
app.post('/api/pix', async (req, res) => {
  const { amount, customer } = req.body;

  try {
    const doc = await db.collection('config').doc('global').get();
    const blackcatKey = doc.exists ? doc.data().blackcatKey : null;

    if (!blackcatKey) {
      return res.status(400).json({ error: 'Chave da BlackCat não configurada no painel.' });
    }

    const response = await axios.post('https://api.blackcatoficial.com/api/sales/create-sale', {
      amount: amount,
      paymentMethod: 'PIX',
      customer: {
        name: customer.name,
        document: customer.document
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': blackcatKey
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error("Erro BlackCat:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Erro ao gerar PIX na BlackCat' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
