
import { setupGaplanTenant } from './src/lib/setup_firestore';

const setup = async () => {
  await setupGaplanTenant();
  process.exit(0);
};

setup();
