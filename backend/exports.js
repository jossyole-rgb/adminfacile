const { Document, Packer, Paragraph } = require("docx");
async function docx(content) {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          children: content
            .split("\n")
            .map((t) => new Paragraph({ text: t, spacing: { after: 130 } })),
        },
      ],
    }),
  );
}
// PDFKit prend en charge les tables xref, les retours à la ligne et la pagination.
function pdf(content) {
  const { PDFDocument } = require("pdfkit");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: "Courrier AdminFacile" },
      compress: true,
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    // La police PDF standard couvre les caractères occidentaux ; DOCX conserve Unicode.
    const western = content.replace(
      /[^\u0009\u000a\u000d\u0020-\u00ff\u0152\u0153\u0178\u0192\u02c6\u02dc\u2013-\u2022\u2026\u2030\u2039\u203a\u20ac]/gu,
      "?",
    );
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#192D46")
      .text(western, { lineGap: 5 });
    doc.end();
  });
}
module.exports = { pdf, docx };
