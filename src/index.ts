import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { buildApp } from "./app.js";
const app = buildApp();

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`API running on :${port}`))
  .catch(err => { app.log.error(err); process.exit(1); });
import { routeRoutes } from "./routes/routes.js";
