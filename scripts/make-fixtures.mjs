import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'

const outDir = new URL('../e2e/.fixtures/', import.meta.url)
await mkdir(outDir, { recursive: true })

// ---- PDF：2 页 + 标题/作者元数据 ----
const pdf = await PDFDocument.create()
pdf.setTitle('E2E 测试 PDF')
pdf.setAuthor('Hermes')
const font = await pdf.embedFont(StandardFonts.Helvetica)
for (const [i, text] of ['Hello PDF page 1', 'Hello PDF page 2'].entries()) {
  const page = pdf.addPage([595, 842])
  page.drawText(text, { x: 72, y: 770, size: 24, font })
  page.drawText(`(page ${i + 1})`, { x: 72, y: 730, size: 14, font })
}
await writeFile(new URL('test.pdf', outDir), await pdf.save())

// ---- EPUB3：单章，正文含唯一标记字符串 ----
const zip = new JSZip()
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file(
  'META-INF/container.xml',
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
)
zip.file(
  'OEBPS/content.opf',
  `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:oll-e2e-0001</dc:identifier>
    <dc:title>E2E 测试 EPUB</dc:title>
    <dc:creator>Hermes</dc:creator>
    <dc:language>zh</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
)
zip.file(
  'OEBPS/nav.xhtml',
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">第 1 章</a></li></ol></nav></body>
</html>`,
)
zip.file(
  'OEBPS/chapter1.xhtml',
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第 1 章</title></head>
<body><h1>第 1 章</h1><p>Hello EPUB 正文内容 HELLO-EPUB-MARKER</p></body>
</html>`,
)
await writeFile(new URL('test.epub', outDir), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

console.log('fixtures written to e2e/.fixtures/')
