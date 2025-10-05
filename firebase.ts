import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore, enableIndexedDbPersistence } from "firebase/firestore";

// --- INSTRUÇÕES ---
// 1. Acesse o console do Firebase do seu projeto.
// 2. Vá para as Configurações do Projeto (ícone de engrenagem).
// 3. Na aba "Geral", role para baixo até "Seus apps".
// 4. Selecione seu aplicativo da web e encontre o objeto de configuração do Firebase (firebaseConfig).
// 5. Copie os valores correspondentes e cole-os abaixo, substituindo os textos "SUA_CHAVE_AQUI".

const firebaseConfig = {
  apiKey: "AIzaSyB7jXZ7jVFdT2RijL-GX6V1FwZXF5AHcYo",
  authDomain: "siga-17cso.firebaseapp.com",
  projectId: "siga-17cso",
  storageBucket: "siga-17cso.firebasestorage.app",
  messagingSenderId: "487541593733",
  appId: "1:487541593733:web:e804a9fa676ab10a733bec",
};

// Inicializa o Firebase
const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

// Habilita a persistência offline para uma melhor experiência do usuário e para
// lidar com conexões de internet intermitentes.
enableIndexedDbPersistence(db)
  .then(() => {
    console.log("Persistência offline do Firestore habilitada.");
  })
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn("A persistência do Firestore falhou: várias abas abertas. A persistência só pode ser ativada em uma aba por vez.");
    } else if (err.code == 'unimplemented') {
      console.warn("A persistência do Firestore não é suportada neste navegador.");
    } else {
      console.error("Erro ao habilitar a persistência do Firestore:", err);
    }
  });


export { app, auth, db };