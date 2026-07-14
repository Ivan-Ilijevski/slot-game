// Next.js instrumentation hook: runs once when the server process starts.
// Boots the SAS EGM service (serial link to the SMIB + CMS bridge).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startSasService } = await import('./lib/sas/singleton')
    startSasService()
  }
}
