export async function extractTextFromPDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result)
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise
        let fullText = ''
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          fullText += content.items.map((item) => item.str).join(' ') + '\n'
        }
        if (!fullText.trim()) throw new Error('No readable text found in PDF. The file may be scanned or image-based.')
        resolve(fullText.trim())
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export async function renderPDFToImages(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result)
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise
        const images = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width
          
          await page.render({ canvasContext: context, viewport: viewport }).promise
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          images.push(dataUrl)
        }
        resolve(images)
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

