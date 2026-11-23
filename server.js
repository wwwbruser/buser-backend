const admin = require('firebase-admin');

try {
  // Lê a variável do Render
  const serviceAccountJson = process.env.FIREBASE_CREDENTIALS;
  
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_CREDENTIALS não encontrada.");
  }

  // Remove aspas simples extras que podem ter vindo do Render
  const cleanedJson = serviceAccountJson.replace(/^'|'$/g, '');
  
  // Faz o parse do JSON
  const serviceAccount = JSON.parse(cleanedJson);

  // Corrige a quebra de linha da chave privada
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tela-buser-default-rtdb.firebaseio.com" // Confirme se esta URL está correta
  });
  
  console.log("✅ Firebase conectado com sucesso!");
} catch (error) {
  console.error("❌ Erro ao conectar no Firebase:", error.message);
}
