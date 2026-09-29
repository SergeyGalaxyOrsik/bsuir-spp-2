import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type StoredFile = { path: string; name: string; mime: string; size: number }

export interface FileStorage {
  save(file: File): Promise<StoredFile>
  read(path: string): Promise<Buffer>
  remove(path: string): Promise<void>
}

export class DiskFileStorage implements FileStorage {
  constructor(private readonly directory: string) {}

  async save(file: File) {
    await mkdir(this.directory, { recursive: true })
    const path = randomUUID()
    await writeFile(join(this.directory, path), Buffer.from(await file.arrayBuffer()))
    return { path, name: file.name, mime: file.type, size: file.size }
  }

  read(path: string) {
    return readFile(join(this.directory, path))
  }

  async remove(path: string) {
    await rm(join(this.directory, path), { force: true })
  }
}
