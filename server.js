const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔒 FIREBASE
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
// 🗺️ COORDENADAS DAS CIDADES (Capitais e principais polos)
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
    "guarulhos, sp": [-23.4538, -46.5333], "osasco, sp": [-23.5325, -46.7917],
    "santos, sp": [-23.9618, -46.3322], "ribeirao preto, sp": [-21.1704, -47.8103],
    "uberlandia, mg": [-18.9186, -48.2772], "juiz de fora, mg": [-21.7642, -43.3502],
    "londrina, pr": [-23.3045, -51.1696], "maringa, pr": [-23.4205, -51.9331],
    "joinville, sc": [-26.3045, -48.8487], "blumenau, sc": [-26.9194, -49.0661],
    "caxias do sul, rs": [-29.1678, -51.1794], "feira de santana, ba": [-12.2664, -38.9663],
    "ilheus, ba": [-14.7936, -39.0465], "porto seguro, ba": [-16.4497, -39.0647],
    "caruaru, pe": [-8.2833, -35.9758], "petrolina, pe": [-9.3922, -40.5033],
    "mossoro, rn": [-5.1875, -37.3442], "maraba, pa": [-5.3686, -49.1178],
    "santarem, pa": [-2.4431, -54.7083], "anapolis, go": [-16.3267, -48.9528],
    "rondonopolis, mt": [-16.4708, -54.6356], "dourados, ms": [-22.2211, -54.8056],
    "imperatriz, ma": [-5.5264, -47.4917], "angra dos reis, rj": [-23.0067, -44.3181],
    "cabo frio, rj": [-22.8800, -42.0186], "niteroi, rj": [-22.8833, -43.1036],
    "vila velha, es": [-20.3297, -40.2925], "chapeco, sc": [-27.1000, -52.6153]
};

// ============================================================
// 🧮 FUNÇÕES MATEMÁTICAS PARA QUALQUER CIDADE
// ============================================================
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round((R * c) * 1.3); // Fator 1.3 = estradas curvam
}

// Fallback para cidades sem coordenadas (Gera distância fixa baseada no nome)
function hashDistance(origem, destino) {
    const pair = [origem.toLowerCase(), destino.toLowerCase()].sort().join('-');
    let hash = 0;
    for (let i = 0; i < pair.length; i++) {
        hash = ((hash << 5) - hash) + pair.charCodeAt(i);
        hash = hash & hash;
    }
    // Retorna algo entre 150km e 1500km (nunca muda para o mesmo par)
    return 150 + (Math.abs(hash) % 1350);
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
        console.log(`📥 Pedido ${pedidoId} enfileirado.`);
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
// WORKER (GERADOR UNIVERSAL DE VIAGENS)
// ============================================================
console.log('Worker iniciado. Gerador Universal de Viagens pronto...');

db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ Gerando viagens para: ${pedido.origem} -> ${pedido.destino}`);

    try {
        const origem = pedido.origem.toLowerCase();
        const destino = pedido.destino.toLowerCase();
        const [origemCidade] = pedido.origem.split(',').map(s => s.trim());
        const [destinoCidade] = pedido.destino.split(',').map(s => s.trim());

        // 🔥 CALCULA A DISTÂNCIA (Tenta usar coordenadas, senão usa hash)
        let distanciaKm = 0;
        if (COORDENADAS[origem] && COORDENADAS[destino]) {
            distanciaKm = calcularDistanciaHaversine(
                COORDENADAS[origem][0], COORDENADAS[origem][1],
                COORDENADAS[destino][0], COORDENADAS[destino][1]
            );
        } else {
            distanciaKm = hashDistance(origem, destino);
        }
        console.log(`📏 Distância calculada: ${distanciaKm} km`);

        // 🔥 Tabela de tarifas por km
        const TARIFAS = { 'Convencional': 0.25, 'Executivo': 0.35, 'Semi-leito': 0.40, 'Leito': 0.45 };
        const empresas = ['Catedral', 'Nacional', 'Gontijo', 'Expresso do Sul', 'Itapemirim', 'Águia Branca'];
        const tipos = ['Convencional', 'Executivo', 'Semi-leito', 'Leito'];
        
        const qtdViagens = Math.floor(Math.random() * 3) + 3; 
        const resultado = [];

        for (let i = 0; i < qtdViagens; i++) {
            const empresa = empresas[Math.floor(Math.random() * empresas.length)];
            const tipo = tipos[Math.floor(Math.random() * tipos.length)];
            
            const tarifaPorKm = TARIFAS[tipo];
            let precoBase = distanciaKm * tarifaPorKm;
            
            // Mínimo de R$ 30 para viagens curtas
            if (precoBase < 30) precoBase = 30 + (Math.random() * 10);
            const precoFinal = Math.round(precoBase * (0.9 + Math.random() * 0.2) * 100) / 100;

            const horaSaida = Math.floor(Math.random() * 18) + 5;
            const minutoSaida = Math.random() > 0.5 ? '30' : '00';
            const timeSaida = `${String(horaSaida).padStart(2, '0')}:${minutoSaida}`;
            
            // Tempo de viagem baseado em 80km/h
            const horasViagem = Math.max(1, Math.ceil(distanciaKm / 80));
            const horaChegada = (horaSaida + horasViagem) % 24;
            const timeChegada = `${String(horaChegada).padStart(2, '0')}:${minutoSaida}`;

            // Poltronas 35%
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
        console.log(`✅ Viagens geradas com sucesso para ${pedidoId}.`);

    } catch (error) {
        console.error(`❌ Falha no pedido ${pedidoId}:`, error);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro ao gerar viagens.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
