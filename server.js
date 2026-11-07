const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const GECKO_API_KEY = 'pk_live_-N166qQYpBhtxDPPlLz8Uqd6zvlRKh7T';

// Inicializa o Firebase Admin (Seguro, sem travar o servidor se não achar credenciais)
try {
  admin.initializeApp({
    projectId: 'buser202872a' // Nome do seu projeto novo
  });
} catch (e) {
  console.log("Aviso: Firebase Admin já inicializado ou com erro.", e.message);
}
const db = admin.firestore();

// Rota de Busca de Viagens
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
      destinationState: destinoParts[1] || 'RJ',
      departureDate: data
    };

    const response = await axios.post('https://api.geckoapi.com.br/v1/extract', payload, {
      headers: { 'Authorization': `Bearer ${GECKO_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    // Se a GeckoAPI não retornar dados, manda lista vazia
    if (!response.data || !response.data.data) {
       console.log("GeckoAPI retornou vazio.");
       return res.json([]); 
    }
    
    console.log(`SUCESSO! ${response.data.data.length} viagens encontradas.`);
    res.json(response.data.data);
    
  } catch (error) {
    console.error("Erro na GeckoAPI:", error.response ? error.response.data : error.message);
    // Se der erro, devolve lista vazia para o site não travar
    res.json([]); 
  }
});

// Rota de Pagamento PIX (BlackCat)
app.post('/api/pix', async (req, res) => {
  const { amount, customer } = req.body;

  try {
    // 1. Vai no Firebase e pega a chave que você salvou no painel
    const doc = await db.collection('config').doc('global').get();
    const blackcatKey = doc.exists ? doc.data().blackcatKey : null;

    if (!blackcatKey) {
      return res.status(400).json({ error: 'Chave da BlackCat não configurada no painel.' });
    }

    // 2. Gera a cobrança na BlackCat
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
