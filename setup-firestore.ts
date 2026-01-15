import { setupGaplanTenant } from './src/lib/setup_firestore.ts';

setupGaplanTenant().then(() => {
  console.log('Setup complete.');
}).catch((e) => {
    console.error(e);
});
