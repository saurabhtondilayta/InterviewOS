import fs from 'node:fs'
import path from 'node:path'

/** Builds a small, valid, text-based PDF resume for upload tests (no external tools needed). */
export function sampleResumePdf(): string {
  const lines = [
    'Asha Tester',
    'Education: B.Tech Computer Science (Cloud Computing), 2023-2027, CGPA 8.4',
    'Skills: Python, Java, SQL, AWS, Docker, Git, Linux',
    'Project: Expense tracker - Flask and PostgreSQL web app deployed on AWS EC2 behind Nginx.',
    'Project: CI pipeline with GitHub Actions that runs tests and builds Docker images.',
    'Certifications: AWS Certified Cloud Practitioner (in progress)',
    'Achievements: Top 10 in the college hackathon 2025.',
  ]
  const content = 'BT /F1 11 Tf 50 750 Td 16 TL ' + lines.map((l) => `(${l}) '`).join(' ') + ' ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  const file = path.resolve(import.meta.dirname, '..', 'test-results', 'Asha_Tester_Resume.pdf')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, pdf, 'latin1')
  return file
}
