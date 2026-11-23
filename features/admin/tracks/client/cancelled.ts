/** Thrown (and recognised) when the admin cancels an upload that is running. */
export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadCancelled';
  }
}
