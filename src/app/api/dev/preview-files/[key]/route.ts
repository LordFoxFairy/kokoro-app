import { NextResponse } from "next/server"

// Development-only bytes for the `!delivery` workbench fixture. The fixture
// must exercise the same authenticated fetch -> Blob -> preview path as the
// real session service, without producing a misleading 503 in the browser.
// This route is deliberately not a generic file store and accepts one known
// content hash only.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PREVIEW_DELIVERY_HASH = "preview-delivery-report"

const PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 83 >>
stream
BT
/F1 24 Tf
72 720 Td
(Kokoro preview delivery) Tj
/F1 12 Tf
0 -32 Td
(Local fixture for the desktop Canvas.) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000275 00000 n 
0000000345 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
478
%%EOF
`

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  // Never make a fixture route available from a production deployment.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const { key } = await context.params
  if (key !== PREVIEW_DELIVERY_HASH) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return new Response(new TextEncoder().encode(PDF), {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": 'inline; filename="preview-report.pdf"',
      "content-type": "application/pdf",
    },
  })
}
