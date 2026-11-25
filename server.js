const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ==========================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================
try {
  const serviceAccount = {
    type: "service_account",
    project_id: "tela-buser", 
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC23mr0rWvK8r53\nuIG0W6AU8ugOH1G3VeJaPY0duB5IHG8VAXBsY9GW/G121KVMmJWJ5qn3wf0qZZ3K\nTWgzyYVD2hu2shd222ucZ37v0rsUQf5YJ/0ExQyhDmZABdoJcjVoBxUSr6KaQAwe\nv7fv1auVE06ylD6B/CYDD2HnKenIxFECJYOFOJHZKGypjMSgxVRz2M0IzFyk80y3\nlEu2lCVy0qjeAveRoPmWoP06gtVVwjcS8mFizHrFr9s8FTmAxDWQlzQGfOgOle4J\npwwZci17eCJU/IFZsDnE1OBxFvi/0fH+M8m1bphE+GOn1dG6WMgltGtU08lCGbwa\ngPmQB0krAgMBAAECggEACTLB3YHVoLU6GGqK96f+Mt+PBZrUsOycgJ6E+SA4QbdQ\nbRWP8pvIwJf855PFpscsCm40UXaMBfRrje/71FMIJYQUjcmCfaOG06yvCWAnsdqp\n8QQ96V4CBx3izcidkYkRn6RvjmuQOcML+QX6uhEc2thIRppHVKF6xf+hlI+ap1MG\n3JpyWTKi65ys5SptwTBjunhZ4QJNTfDffC8yN8RAezhtJMpJp3b3l6NZQA6Et9Rm\n2c3CyvkToHWNahN8m/domkzJNPV+u/zAlDb5ajIeBDNb8r54jD3MibvK3tei1/9c\nrmfb9vvmlurtDCQByCP1v8ee9HAZRU6Zoc/aQKn7jQKBgQDc9nRKXDV9eV5IGelh\n1FCZaFUrj38O8WszEhSTsGvhqmVQt6PVo+aMkEo3/H+2fiWqZNDIhvQRE2IA4gNj\nBMP8/EnUWl7pXNGeuLgS15HMJszuHtRcRP1l36KLBXeHQccgxrjYMfvBI4SGm7nP\nNnQuHWVbFpuuKh5mIYMHZLLx3wKBgQDT3Z33wsa65InrQwDaidBpl65QzEP/wKRf\nnKuuUdZk1B8xJhD5VSjP/erpeiM19RLPD9r1pF5nev9jpDO4oOMYBjw/5CG/DhCG\nsF8GNokxRkXZOh+oTnzzOlK1gwlG4vFovumxpt8DLUtUIYAALIwyTSmxEYXTTlo9\nIPyyzIeKNQKBgQDK0tsKCrv60fZOHqLQbvAQ8OkFFDHgCJCLD3Sd4JoWSa+4OOkF\nSO5uZmAKJhcg74gpcWMIPoA4UF9sSgor0QsJ5JbseouWj+HGXO5yNTgaeh8wEFKD\n47vp0C7Gh50hJargFilEIhViQvT6DmWvo99fGRKZWxZJ91VyEB7TIYb0ZwKBgF2M\nu9XM0Ydwpl2VZmkY9UfKzBOtPlFNtMbrHPuJ80ruRx+imVge/Dhq/DE/1xBaOIXp\nkFtqyqySqPZMaPIbSGsxRaVIjIYaJb3zXuIVbpqtVuZGPfhJP+7+T8sKIyyDxOjl\nc7cX4d07QMnTSPvKr9T+MWyYOilFrZ7UVAB3Q1oJAoGAKqTNbBGQrlhHWeA5jC1g\nUlRclvgLsa+ihBSv6AO8h3E0BUjac74islXLETBbG2Bv8BwBq1bnqrf2b4urUElX\niVESXxIbqSDq8NWgZIGtuKu2riPEU5qfpuOtVMGeechP4VrC6zZFQCQaAFjmp8oL\nrgXfZT1D+b32Q6fLENhXmBg=\n-----END PRIVATE KEY-----\n",
    client_email: "firebase-adminsdk-fbsvc@tela-buser.iam.gserviceaccount.com" 
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tela-buser-default-rtdb.firebaseio.com"
  });
  
  console.log("✅ Firebase conectado com sucesso!");
} catch (error) {
  console.error("❌ Erro ao conectar no Firebase:", error.message);
}

// ==========================================
// 2. CONFIGURAÇÃO DO SERVIDOR E CORS
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Servidor Buser está rodando perfeitamente!');
});

// ==========================================
// 3. CONFIGURAÇÃO DO PROXY GTIPROXY
// ==========================================
const proxyUrl = 'http://gtiba6fce988c:3669c16d34ef@srv.gtiproxy.com:8056';
const proxyAgent = new HttpsProxyAgent(proxyUrl);

// ==========================================
// 4. FUNÇÃO AUXILIAR PARA CRIAR O "SLUG" DA CIDADE
// ==========================================
// Transforma "São Paulo, SP" em "sao-paulo-sp-todos"
function criarSlugCidade(cidadeCompleta) {
  if (!cidadeCompleta) return '';
  // Separa o nome da cidade e o estado (ex: "São Paulo" e "SP")
  const [cidade, estado] = cidadeCompleta.split(',').map(s => s.trim());
  
  // Remove acentos e caracteres especiais, converte para minúsculas e troca espaços por hífen
  const cidadeSlug = cidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
    
  return `${cidadeSlug}-${estado.toLowerCase()}-todos`;
}

// ==========================================
// 5. ROTA DE BUSCA
// ==========================================
const cacheViagens = {};

app.get('/api/clickbus/search', async (req, res) => {
  try {
    const { origem, destino, data } = req.query;
    console.log(`🔍 Buscando viagens REAIS de ${origem} para ${destino} na data ${data}`);

    // Cria os slugs para a API do ClickBus
    const fromSlug = criarSlugCidade(origem);
    const toSlug = criarSlugCidade(destino);

    // ⚠️ O clientId é um identificador que o ClickBus usa. 
    // Se este não funcionar, você precisará capturá-lo no site do ClickBus (F12 -> Network -> procure por clientId na URL).
    const clientId = 'clickbus-web'; 

    // URL CORRIGIDA COM TODOS OS PARÂMETROS EXIGIDOS
    const urlClickbus = `https://api.clickbus.com/api/v4/trips?from=${fromSlug}&to=${toSlug}&departureDate=${data}&clientId=${clientId}`;

    console.log(`⏳ Chamando o ClickBus através do Proxy GTIPROXY...`);
    console.log(`🔗 URL: ${urlClickbus}`);
    
    const response = await axios.get(urlClickbus, {
      httpsAgent: proxyAgent,
      timeout: 25000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const dadosReais = response.data;
    console.log("✅ Dados recebidos com sucesso do Proxy!");

    if (typeof dadosReais === 'string' && dadosReais.includes('<!DOCTYPE html>')) {
        throw new Error("O ClickBus retornou HTML (provavelmente bloqueou o proxy).");
    }
    
    const pedidoId = "real_" + Date.now();
    cacheViagens[pedidoId] = dadosReais;

    res.json({
      pedidoId: pedidoId,
      mensagem: "Busca real iniciada."
    });

  } catch (error) {
    if (error.response) {
        console.error(`❌ Erro do ClickBus: Status ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
        console.error("❌ Erro na busca real:", error.message);
    }
    res.status(500).json({ error: 'Erro ao buscar no ClickBus. Verifique os logs.' });
  }
});

// ==========================================
// 6. ROTA DE RESULTADO
// ==========================================
app.get('/api/clickbus/resultado/:pedidoId', async (req, res) => {
  try {
    const { pedidoId } = req.params;
    const dadosDaViagem = cacheViagens[pedidoId];

    if (!dadosDaViagem) {
       return res.json({ status: 'processando' });
    }

    res.json({
      status: 'concluido',
      data: dadosDaViagem.trips || dadosDaViagem.viagens || dadosDaViagem.data || dadosDaViagem.results || [], 
      mensagem: "Busca concluída."
    });

    delete cacheViagens[pedidoId];

  } catch (error) {
    console.error("Erro no resultado:", error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ==========================================
// 7. INICIALIZAÇÃO
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
