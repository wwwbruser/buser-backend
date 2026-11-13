const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔒 FIREBASE (USANDO O JSON COMPLETO DA VARIÁVEL DE AMBIENTE)
// ============================================================
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Admin inicializado com sucesso.");
  } catch (error) {
    console.error("❌ ERRO CRÍTICO no Firebase:", error.message);
  }
}
const db = admin.database();

// ============================================================
// 🗺️ COORDENADAS DAS CIDADES (Para o cálculo de distância)
// ============================================================
const COORDENADAS = {
    "sao paulo, sp": [-23.5505, -46.6333], "rio de janeiro, rj": [-22.9068, -43.1729],
    "belo horizonte, mg": [-19.9167, -43.9345], "brasilia, df": [-15.8267, -47.9218],
    "salvador, ba": [-12.9777, -38.5016], "fortaleza, ce": [-3.7319, -38.5267],
    "recife, pe": [-8.0476, -34.8770], "porto alegre, rs": [-30.0346, -51.2177],
    "curitiba, pr": [-25.4284, -49.2733], "manaus, am": [-3.1190, -60.0217],
    "belem, pa": [-1.4558, -48.4902], "goiania, go": [-16.6864, -49.2643],
    "campinas, sp": [-22.9099, -47.0626], "sao luis, ma": [-2.5387, -44.2825],
    "maceio, al": [-9.6658, -35.7353], "natal, rn": [-5.7945, -35.2110],
    "teresina, pi": [-5.0892, -42.8016], "campo grande, ms": [-20.4697, -54.6201],
    "joao pessoa, pb": [-7.1195, -34.8450], "aracaju, se": [-10.9091, -37.0677],
    "cuiaba, mt": [-15.6014, -56.0979], "florianopolis, sc": [-27.5954, -48.5480],
    "vitoria, es": [-20.3155, -40.3128], "porto velho, ro": [-8.7608, -63.8999],
    "macapa, ap": [0.0349, -51.0694], "rio branco, ac": [-9.9754, -67.8249],
    "boa vista, rr": [2.8235, -60.6758], "palmas, to": [-10.1689, -48.3317],
    "angra dos reis, rj": [-23.0067, -44.3181], "imperatriz, ma": [-5.5264, -47.4917]
};

// ============================================================
// 🧮 FUNÇÕES DE CÁLCULO
// ============================================================
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round((R * c) * 1.3); 
}

function hashDistance(origem, destino) {
    const pair = [origem.toLowerCase(), destino.toLowerCase()].sort().join('-'); let hash = 0;
    for (let i = 0; i < pair.length; i++) { hash = ((hash << 5) - hash) + pair.charCodeAt(i); hash = hash & hash; }
    return 150 + (Math.abs(hash) % 1350);
}

// 🔥 FÓRMULA DE PREÇO PROGRESSIVO (Preços reais)
function calcularPrecoBase(distanciaKm, tipo) {
    let preco = 10; // Taxa de embarque

    if (distanciaKm <= 100) {
        preco += distanciaKm * 0.45;
    } else if (distanciaKm <= 500) {
        preco += (100 * 0.45) + ((distanciaKm - 100) * 0.22);
    } else if (distanciaKm <= 1500) {
        preco += (100 * 0.45) + (400 * 0.22) + ((distanciaKm - 500) * 0.12);
    } else {
        preco += (100 * 0.45) + (400 * 0.22) + (1000 * 0.12) + ((distanciaKm - 1500) * 0.08);
    }

    const multiplicadores = { 'Convencional': 1.0, 'Executivo': 1.3, 'Semi-leito': 1.5, 'Leito': 1.8 };
    return preco * (multiplicadores[tipo] || 1.0);
}

// ============================================================
// ROTAS DO WEB SERVICE
// ============================================================
app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;
    if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });

    const pedidoId = uuidv4();
    try {
        await db.ref(`fila_pedidos/${pedidoId}`).set({ status: 'processando', origem, destino, data, criadoEm: Date.now() });
        res.status(202).json({ message: 'Busca em andamento.', pedidoId });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar pedido.' });
    }
});

app.get('/api/clickbus/resultado/:pedidoId', async (req, res) => {
    const { pedidoId } = req.params;
    try {
        const snapshot = await db.ref(`fila_pedidos/${pedidoId}`).once('value');
        const pedido = snapshot.val();
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (pedido.status === 'processando') return res.status(202).json({ status: 'processando' });
        if (pedido.status === 'erro') return res.status(500).json({ status: 'erro', message: pedido.erro });
        res.json({ status: 'concluido', data: pedido.resultado });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao consultar.' });
    }
});

// ============================================================
// WORKER DO RENDER (FALLBACK MATEMÁTICO)
// ============================================================
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    // ⏳ Espera 10 segundos para ver se o PC resolve
    setTimeout(async () => {
        const snapAtual = await db.ref(`fila_pedidos/${pedidoId}`).once('value');
        const pedidoAtual = snapAtual.val();
        if (pedidoAtual.status !== 'processando' && pedidoAtual.status !== 'erro_pc') return;

        console.log(`\n⏳ PC não respondeu a tempo. Render gerando viagens (Fallback) para: ${pedido.origem} -> ${pedido.destino}`);

        try {
            const origem = pedido.origem.toLowerCase();
            const destino = pedido.destino.toLowerCase();
            const [origemCidade] = pedido.origem.split(',').map(s => s.trim());
            const [destinoCidade] = pedido.destino.split(',').map(s => s.trim());

            let distanciaKm = COORDENADAS[origem] && COORDENADAS[destino] 
                ? calcularDistanciaHaversine(COORDENADAS[origem][0], COORDENADAS[origem][1], COORDENADAS[destino][0], COORDENADAS[destino][1])
                : hashDistance(origem, destino);

            const empresas = ['Catedral', 'Nacional', 'Gontijo', 'Expresso do Sul', 'Itapemirim', 'Águia Branca'];
            const tipos = ['Convencional', 'Executivo', 'Semi-leito', 'Leito'];
            const qtdViagens = Math.floor(Math.random() * 3) + 3; 
            const resultado = [];

            for (let i = 0; i < qtdViagens; i++) {
                const empresa = empresas[Math.floor(Math.random() * empresas.length)];
                const tipo = tipos[Math.floor(Math.random() * tipos.length)];
                let precoBase = calcularPrecoBase(distanciaKm, tipo);
                const precoFinal = Math.round(precoBase * (0.95 + Math.random() * 0.1) * 100) / 100;

                const horaSaida = Math.floor(Math.random() * 18) + 5;
                const minutoSaida = Math.random() > 0.5 ? '30' : '00';
                const timeSaida = `${String(horaSaida).padStart(2, '0')}:${minutoSaida}`;
                
                const horasViagem = Math.max(1, Math.ceil(distanciaKm / 80));
                const horaChegada = (horaSaida + horasViagem) % 24;
                const timeChegada = `${String(horaChegada).padStart(2, '0')}:${minutoSaida}`;

                const totalAssentos = 46;
                const qtdOcupadas = Math.floor(totalAssentos * 0.35);
                const todasPoltronas = Array.from({length: totalAssentos}, (_, i) => i + 1);
                let seed = (pedidoId + i).toString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                for (let k = todasPoltronas.length - 1; k > 0; k--) {
                    seed = (seed * 9301 + 49297) % 233280;
                    const j = Math.floor((seed / 233280) * (k + 1));
                    [todasPoltronas[k], todasPoltronas[j]] = [todasPoltronas[j], todasPoltronas[k]];
                }

                resultado.push({
                    id: uuidv4(),
                    company: { name: empresa, logo: '' },
                    price: precoFinal,
                    bus_type: tipo,
                    total_seats: totalAssentos,
                    occupied_seats: todasPoltronas.slice(0, qtdOcupadas),
                    departure: { time: timeSaida, city: origemCidade, terminal: { name: 'Rodoviária Principal', address: '' } },
                    arrival: { time: timeChegada, city: destinoCidade, terminal: { name: 'Terminal Rodoviário', address: '' } }
                });
            }

            await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'concluido', resultado, concluidoEm: Date.now() });
        } catch (error) {
            await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro no fallback.' });
        }
    }, 10000); // 10 segundos
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
