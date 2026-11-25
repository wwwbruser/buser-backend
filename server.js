// Variável para guardar o resultado temporariamente (para o front-end buscar)
const cacheViagens = {};

// ==========================================
// 3. ROTA DE BUSCA (Agora com o Proxy Real)
// ==========================================
app.get('/api/clickbus/search', async (req, res) => {
  try {
    const { origem, destino, data } = req.query;
    console.log(`🔍 Buscando viagens REAIS de ${origem} para ${destino} na data ${data}`);

    // ⚠️ ATENÇÃO: Substitua essa URL pela URL REAL da API do ClickBus
    // Você precisa descobrir isso olhando a aba Network (F12) do site do ClickBus.
    const urlClickbus = `https://www.clickbus.com.br/api/v1/search?origem=${encodeURIComponent(origem)}&destino=${encodeURIComponent(destino)}&data=${data}`;

    // ⚠️ AQUI ENTRA O SEU PROXY
    // Se você configurou no Render como variável de ambiente, use process.env.NOME_DA_VARIAVEL
    // Exemplo com ScraperAPI: 
    // const proxyUrl = `http://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(urlClickbus)}`;
    
    // Ou se o seu proxy recebe a URL direto:
    const proxyUrl = `https://seu-proxy-aqui.com/?url=${encodeURIComponent(urlClickbus)}`;

    console.log(`⏳ Chamando o Proxy: ${proxyUrl}`);
    
    // O Render faz a requisição para o Proxy (e o proxy para o ClickBus)
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`O Proxy ou o ClickBus retornou erro: ${response.status}`);
    }

    // Pega os dados reais (JSON)
    const dadosReais = await response.json();
    console.log("✅ Dados recebidos com sucesso!");
    
    // Gera um ID e guarda os dados no cache
    const pedidoId = "real_" + Date.now();
    cacheViagens[pedidoId] = dadosReais;

    // Devolve o ID para o front-end começar a consultar
    res.json({
      pedidoId: pedidoId,
      mensagem: "Busca real iniciada."
    });

  } catch (error) {
    console.error("❌ Erro na busca real:", error.message);
    res.status(500).json({ error: 'Erro ao buscar no ClickBus. Verifique os logs do Render.' });
  }
});

// ==========================================
// 4. ROTA DE RESULTADO (Entrega os dados reais para o site)
// ==========================================
app.get('/api/clickbus/resultado/:pedidoId', async (req, res) => {
  try {
    const { pedidoId } = req.params;
    
    // Pega os dados que guardamos no cache
    const dadosDaViagem = cacheViagens[pedidoId];

    if (!dadosDaViagem) {
       // Se não achou, avisa o front-end que ainda está processando
       return res.json({ status: 'processando' });
    }

    // Devolve os dados para o front-end
    // ⚠️ Dependendo de como o ClickBus devolve, a lista pode estar em .data, .viagens, .trips, etc.
    // Você vai precisar olhar o log do Render para ver como o JSON chegou.
    res.json({
      status: 'concluido',
      data: dadosDaViagem.viagens || dadosDaViagem.data || dadosDaViagem.results || [], 
      mensagem: "Busca concluída."
    });

    // Limpa o cache para não encher a memória do Render
    delete cacheViagens[pedidoId];

  } catch (error) {
    console.error("Erro no resultado:", error);
    res.status(500).json({ error: 'Erro interno' });
  }
});
