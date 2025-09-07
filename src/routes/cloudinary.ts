import { Request, Response, Router } from "express";
import { v2 as cloudinary } from "cloudinary";

const router = Router();

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_UPLOAD_PRESET,
} = process.env;

const ALLOWED_FOLDER_PREFIX = "users/";

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

router.post("/sign", (req: Request, res: Response) => {
  try {
    const { folder, public_id } = req.body ?? {};

    const safeFolder =
      typeof folder === "string" && folder.startsWith(ALLOWED_FOLDER_PREFIX)
        ? folder
        : undefined;

    const safePublicId =
      typeof public_id === "string" && /^[a-zA-Z0-9/_-]+$/.test(public_id)
        ? public_id
        : undefined;

    const timestamp = Math.floor(Date.now() / 1000);

    if (!CLOUDINARY_UPLOAD_PRESET) {
      return res
        .status(500)
        .json({ error: "Server missing CLOUDINARY_UPLOAD_PRESET" });
    }

    const paramsToSign: Record<string, string | number> = {
      timestamp,
      upload_preset: CLOUDINARY_UPLOAD_PRESET,
    };
    if (safeFolder) paramsToSign.folder = safeFolder;
    if (safePublicId) paramsToSign.public_id = safePublicId;

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      CLOUDINARY_API_SECRET as string
    );

    return res.json({
      timestamp,
      signature,
      api_key: CLOUDINARY_API_KEY,
      cloud_name: CLOUDINARY_CLOUD_NAME,
      upload_preset: CLOUDINARY_UPLOAD_PRESET,
      ...(safeFolder ? { folder: safeFolder } : {}),
      ...(safePublicId ? { public_id: safePublicId } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Signing failed" });
  }
});

export default router;
