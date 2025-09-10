export interface CloudinaryUploadFile {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

export function uploadToCloudinary(file: CloudinaryUploadFile): Promise<any>;
