import Fastify from 'fastify';
import dotenv from 'dotenv';
import { postSignal, getSignals } from './signals.js';
import { fileURLToPath } from 'url';

dotenv.config();
const API_KEY = process.env.API_KEY || 'change-me';
const PORT = Number(process.env.PORT || 8080);

export function buildApp(opts = {}) {
  const app = Fastify(opts);

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    const key = req.headers['x-api-key'];
    if (!key || key !== API_KEY) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.post('/v1/signals', postSignal);
  app.get('/v1/signals', getSignals);

  return app;
}

// only listen when executed directly (not imported by tests)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const app = buildApp({ logger: { level: 'info' } });
  app.listen({ host: '0.0.0.0', port: PORT }).catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
}
