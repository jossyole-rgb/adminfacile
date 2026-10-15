/* =========================
   EXPORTS
   Export DOCX commun aux lettres et aux réponses (bibliothèques docx et FileSaver chargées par le CDN).
========================= */

export async function exporterDOCX(texte, nomFichier) {
  const { Document, Packer, Paragraph, TextRun } = window.docx;

  const lignes = texte.split("\n").filter((ligne) => ligne.trim() !== "");

  const documentWord = new Document({
    sections: [
      {
        children: lignes.map(
          (ligne) =>
            new Paragraph({
              children: [new TextRun({ text: ligne, size: 24 })],
              spacing: { after: 200 },
            })
        ),
      },
    ],
  });

  const blob = await Packer.toBlob(documentWord);
  window.saveAs(blob, nomFichier);
}
