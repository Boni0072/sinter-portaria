import { db } from '../components/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

const tenantId = 'gaplan';
const tenantName = 'Gaplan';

export const setupGaplanTenant = async () => {
  const tenantDocRef = doc(db, 'tenants', tenantId);

  try {
    const docSnap = await getDoc(tenantDocRef);

    if (!docSnap.exists()) {
      console.log(`Tenant '${tenantName}' não encontrado. Criando...`);
      await setDoc(tenantDocRef, {
        name: tenantName,
        createdAt: serverTimestamp(),
      });
      console.log(`Tenant '${tenantName}' criado com sucesso com o ID '${tenantId}'.`);
    } else {
      console.log(`Tenant '${tenantName}' já existe.`);
    }
  } catch (error) {
    console.error(`Erro ao configurar o tenant '${tenantName}':`, error);
  }
};
