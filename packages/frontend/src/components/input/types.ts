/** Local attachment before sending. */
export interface LocalAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string; // text content, data URL for images, or base64 for binary
  isImage: boolean;
}
