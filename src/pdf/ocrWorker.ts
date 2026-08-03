import { createWorker, PSM, type Worker } from 'tesseract.js'
import type Tesseract from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('fra').then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      return worker
    })
  }
  return workerPromise
}

/** Recognizes one already-cropped text band (a single line or short paragraph) and returns its text. */
export async function recognizeBand(image: Tesseract.ImageLike): Promise<string> {
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  return data.text.trim()
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}
