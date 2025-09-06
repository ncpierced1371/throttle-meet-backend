import fp from "fastify-plugin";
import jwt from "jsonwebtoken";

export default fp(async function authPlugin(app) {
  app.decorate("requireAuth", async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    const token = authHeader.slice(7);
    try {
  const user = jwt.verify(token, process.env.JWT_SECRET);
      req.user = user;
    } catch (err) {
      reply.code(401).send({ error: "Invalid token" });
    }
  });
});
