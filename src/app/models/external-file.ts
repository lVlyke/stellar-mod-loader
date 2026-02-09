export interface ExternalFile {
    path: string;
    data: Uint8Array<ArrayBuffer>;
    blob: Blob;
    url: string;
    mimeType: string;
}
