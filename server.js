const express = require('express');
const cors = require('cors');

const app = express();

// Habilita o CORS para o seu index.html poder fazer requisições
app.use(cors());

// Rota que o seu index.html chama
app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros: origem, destino ou data.' });
  }

  try {
    // Pega a chave que está configurada no painel Environment do Render
    const apiKey = process.env.GECKO_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ GECKO_API_KEY não configurada nas variáveis de ambiente!');
    }

    // ⚠️ SUBSTITUA A URL ABAIXO PELA URL REAL DA SUA API (GeckoAPI / ClickBus)
    // Exemplo genérico:
    const apiUrl = `https://api.geckoapi.com/v1/bus/search?origem=${encodeURIComponent(origem)}&destino=${encodeURIComponent(destino)}&data=${data}`;

    // Faz a requisição para a API externa
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`, // ou 'x-api-key': apiKey, depende da GeckoAPI
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Erro da API externa: Status ${response.status}`);
      return res.status(response.status).json({ error: `API externa falhou com status ${response.status}` });
    }

    // Converte a resposta para JSON e devolve para o frontend
    const dataJson = await response.json();
    res.json(dataJson);

  } catch (error) {
    console.error('❌ Erro no servidor proxy:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor ao buscar viagens.' });
  }
});

// Porta exigida pelo Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando na porta ${PORT}`);
});
