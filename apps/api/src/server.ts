import { buildApp } from "./app.js";
import { env } from "./lib/env.js";

const app = await buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
