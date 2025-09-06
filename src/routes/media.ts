import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";

// CLOUDINARY_URL format: cloudinary://KEY:SECRET@CLOUD_NAME
function parseCloudinaryUrl(url: string) {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
  if (!m) throw new Error("Invalid CLOUDINARY_URL");
  const [, apiKey, apiSecret, cloudName] = m;
  return { apiKey, apiSecret, cloudName };
}

export async function mediaRoutes(app: FastifyInstance) {
  app.post("/media/sign-upload", { preHandler: app.requireAuth }, async (req, reply) => {
    if (!process.env.CLOUDINARY_URL) return reply.code(400).send({ error: "Cloudinary not configured" });
    const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(process.env.CLOUDINARY_URL!);

    const body = z.object({
      folder: z.string().optional(),
      public_id: z.string().optional(),
      timestamp: z.number().optional()
    }).parse(req.body ?? {});

    const timestamp = body.timestamp ?? Math.floor(Date.now() / 1000);
    const folder = body.folder ?? "throttle-meet";
    const params = new URLSearchParams({ timestamp: String(timestamp), folder, public_id: body.public_id ?? "" });

    const sorted = Array.from(params.entries())
      .filter(([, v]) => v !== "")
      .sort(([a], [b]) => a.localeCompare(b));

    const toSign = sorted.map(([k, v]) => `${k}=${v}`).join("&") + apiSecret;
    const signature = crypto.createHash("sha1").update(toSign).digest("hex");

    return { cloudName, apiKey, timestamp, folder, signature };
  });
}
