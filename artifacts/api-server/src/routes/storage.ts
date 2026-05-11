import { Router, type IRouter, type Request, type Response, raw } from "express";
import { Readable } from "stream";
import multer from "multer";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { authenticate } from "../lib/auth";
import {
  processAndUploadImage,
  ImageValidationError,
  IMAGE_KINDS,
  type ImageKind,
} from "../lib/image-pipeline";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Multer: in-memory storage with a 20 MB safety cap (cliente valida 18 MB; el
// pipeline redimensiona a 1200 px y convierte a WebP, así que originales
// grandes terminan pesando <500 KB en disco).
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

/**
 * POST /storage/upload-image
 *
 * Image pipeline endpoint:
 *   - Accepts multipart/form-data with `file` and `kind` (string).
 *   - Validates content-type (jpeg/png/webp) and size (<= 18 MB).
 *   - Processes with Sharp: resize to max 1200px, convert to WebP q80, strip EXIF.
 *   - Stores at uploads/{kind}/{userId}/{uuid}.webp
 *   - Returns { url, objectPath, width, height, bytes }
 */
router.post(
  "/storage/upload-image",
  authenticate,
  imageUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ code: "NO_FILE", error: "Archivo requerido (campo 'file')." });
        return;
      }

      const kindRaw = String(req.body?.kind ?? "general");
      if (!(IMAGE_KINDS as readonly string[]).includes(kindRaw)) {
        res.status(400).json({ code: "INVALID_KIND", error: `Tipo inválido. Usa: ${IMAGE_KINDS.join(", ")}` });
        return;
      }

      const userId = req.user!.id;

      const result = await processAndUploadImage({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        kind: kindRaw as ImageKind,
        userId,
      });

      res.json(result);
    } catch (err: any) {
      if (err instanceof ImageValidationError) {
        res.status(400).json({ code: err.code, error: err.message });
        return;
      }
      req.log.error({ err }, "Image upload pipeline failed");
      res.status(500).json({ code: "INTERNAL", error: "Error procesando imagen." });
    }
  },
);

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires authentication to prevent unauthorized bucket uploads.
 */
router.post("/storage/uploads/request-url", authenticate, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    let uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    if (uploadURL.startsWith("/")) {
      const host = req.get("host");
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
      uploadURL = `${proto}://${host}${uploadURL}`;
    }

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error: unknown) {
    req.log.error({ err: error }, "Error generating upload URL");
    const err = error as { message?: string; code?: number | string };
    res.status(500).json({
      error: "Failed to generate upload URL",
      detail: err?.message ?? String(error),
      code: err?.code,
    });
  }
});

// PUT /storage/proxy-upload/:objectId
// Receives raw file bytes from the client (no signed URL needed). The server
// uploads the bytes to GCS using the SDK directly. Used in Cloud Run where
// signed URL generation requires the iam.serviceAccounts.signBlob permission.
router.put(
  "/storage/proxy-upload/:objectId",
  authenticate,
  raw({ type: "*/*", limit: "100mb" }),
  async (req: Request, res: Response) => {
    try {
      const objectId = req.params.objectId;
      if (!/^[a-f0-9-]{32,40}$/i.test(objectId)) {
        res.status(400).json({ error: "Invalid object id" });
        return;
      }
      const body = req.body as Buffer | undefined;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Empty body" });
        return;
      }
      const contentType = req.header("content-type") || "application/octet-stream";
      const objectPath = await objectStorageService.uploadObjectFromBuffer(
        objectId,
        body,
        contentType,
      );
      res.json({ ok: true, objectPath });
    } catch (error: unknown) {
      req.log.error({ err: error }, "Proxy upload failed");
      const err = error as { message?: string };
      res.status(500).json({ error: "Proxy upload failed", detail: err?.message });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
