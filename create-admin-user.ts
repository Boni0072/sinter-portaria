
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, setDoc, doc } from "firebase/firestore";
import { firebaseConfig } from "./firebase";

// --- Configuração do Administrador ---
const email = "admin@sinterfutura.com.br";
const password = "admin123";
// ------------------------------------

async function createAdminUser() {
  try {
    console.log("🚀  Inicializando o app Firebase...");
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    console.log(`📝  Criando usuário com email: ${email}...`);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log(`✅  Usuário criado com sucesso! UID: ${user.uid}`);

    console.log("👤  Criando perfil de administrador no Firestore...");
    await setDoc(doc(db, "profiles", user.uid), {
      email: user.email,
      role: 'admin',
      tenantId: user.uid, // Usando o UID como tenantId, conforme a lógica existente
      created_at: new Date().toISOString()
    });

    console.log("🎉  Perfil de administrador criado com sucesso!");
    console.log("\n--- Credenciais do Administrador ---");
    console.log(`   Email: ${email}`);
    console.log(`   Senha: ${password}`);
    console.log("------------------------------------\n");

  } catch (error: any) {
    console.error("❌  Erro ao criar usuário administrador:", error.message);
    if (error.code === 'auth/email-already-in-use') {
      console.error("   -> Este email já está cadastrado. Se você esqueceu a senha, use a função 'Esqueci minha senha' no app ou no console do Firebase.");
    } else if (error.code) {
      console.error(`   Código do erro: ${error.code}`);
    }
  } finally {
    // Forçamos a saída para evitar que o processo fique travado.
    process.exit(0);
  }
}

createAdminUser();
