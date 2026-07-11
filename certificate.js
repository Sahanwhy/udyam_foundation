/* ══════════════════════════════════════════
   UDYAM — Donation Certificate Generator
══════════════════════════════════════════ */

const ORG = {
  name: 'UDYAM FOUNDATION',
  fullName: 'Udyam Social Development Foundation',
  tagline: 'Empowering Youth, Transforming Communities',
  address: 'Kakodonga, Golaghat, Assam, India',
  pan: 'AAETU1234F',
  reg80G: 'AAETU1234F/80G/2024-25',
  reg12A: 'AAETU1234F/12A/2024-25',
};

function formatIndianAmount(amount) {
  const num = Number(amount);
  if (Number.isNaN(num)) return 'INR 0/-';
  const formatted = num.toLocaleString('en-IN');
  return `INR ${formatted}/-`;
}

function formatDateTime(date) {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function generateReceiptNumber() {
  return `RCPT-${Date.now()}`;
}

function drawHeader(doc, title, with80G) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const green = [27, 67, 50];
  const cream = [253, 248, 240];

  doc.setFillColor(...green);
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(ORG.name, pageWidth / 2, 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(ORG.tagline, pageWidth / 2, 24, { align: 'center' });

  doc.setTextColor(...green);
  doc.setFillColor(...cream);
  doc.rect(14, 50, pageWidth - 28, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, pageWidth / 2, 59, { align: 'center' });

  if (with80G) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('(Eligible for tax deduction under Section 80G of the Income Tax Act, 1961)', pageWidth / 2, 68, { align: 'center' });
    return 76;
  }

  return 72;
}

function drawField(doc, label, value, y, margin, contentWidth) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(27, 67, 50);
  doc.text(label, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(String(value || '—'), contentWidth - 52);
  doc.text(lines, margin + 52, y);
  return y + Math.max(8, lines.length * 5.5);
}

function drawFooter(doc, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  doc.setDrawColor(27, 67, 50);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);

  y += 10;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(27, 67, 50);
  doc.text('"Thank you for your generous contribution."', pageWidth / 2, y, { align: 'center' });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text('Your support helps us build a better future in Golaghat.', pageWidth / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('This is an auto-generated receipt.', pageWidth / 2, y, { align: 'center' });
}

function draw80GBlock(doc, data, y, margin, contentWidth) {
  doc.setFillColor(245, 250, 247);
  doc.setDrawColor(27, 67, 50);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 52, 2, 2, 'FD');

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(27, 67, 50);
  doc.text('80G Tax Exemption Certificate', margin + 6, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);

  const certText = [
    `This is to certify that ${ORG.fullName} (PAN: ${ORG.pan}), registered under Section 80G`,
    `(Registration No.: ${ORG.reg80G}), has received a voluntary donation of ${formatIndianAmount(data.amount)}`,
    `from ${data.fullName} (PAN: ${data.pan}), residing at ${data.address}.`,
    'The donor is entitled to claim deduction under Section 80G of the Income Tax Act, 1961,',
    'subject to applicable limits and provisions of the Act.',
  ];

  certText.forEach((line) => {
    doc.text(line, margin + 6, y);
    y += 4.5;
  });

  return y + 8;
}

function generateDonationCertificate(data) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error('jsPDF is not loaded');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const now = new Date();
  const receiptNo = generateReceiptNumber();
  const with80G = Boolean(data.with80G);
  const title = with80G ? 'DONATION RECEIPT (80G)' : 'DONATION RECEIPT';

  let y = drawHeader(doc, title, with80G);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Receipt Number: ${receiptNo}`, margin, y);
  doc.text(`Date & Time: ${formatDateTime(now)}`, pageWidth - margin, y, { align: 'right' });

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  y = drawField(doc, 'Donor Name:', data.fullName, y, margin, contentWidth);
  y = drawField(doc, 'Email Address:', data.email, y + 3, margin, contentWidth);
  y = drawField(doc, 'Phone Number:', data.phone, y + 3, margin, contentWidth);
  y = drawField(doc, 'Address:', data.address, y + 3, margin, contentWidth);

  if (with80G && data.pan) {
    y = drawField(doc, 'PAN Card:', data.pan.toUpperCase(), y + 3, margin, contentWidth);
  }

  y = drawField(doc, 'Payment ID:', data.paymentId, y + 3, margin, contentWidth);
  y = drawField(doc, 'Donation Amount:', formatIndianAmount(data.amount), y + 3, margin, contentWidth);

  if (with80G) {
    y += 6;
    y = draw80GBlock(doc, data, y, margin, contentWidth);
    y = drawField(doc, 'Org. PAN:', ORG.pan, y, margin, contentWidth);
    y = drawField(doc, '80G Reg. No.:', ORG.reg80G, y + 3, margin, contentWidth);
  }

  drawFooter(doc, Math.min(y + 14, 250));

  const safeId = (data.paymentId || receiptNo).replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = with80G
    ? `Udyam_80G_Receipt_${safeId}.pdf`
    : `Udyam_Donation_Receipt_${safeId}.pdf`;

  doc.save(filename);
}

function generateMembershipCertificate(data) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error('jsPDF is not loaded');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const now = new Date();
  const receiptNo = generateReceiptNumber();

  let y = drawHeader(doc, 'MEMBERSHIP RECEIPT', false);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Receipt Number: ${receiptNo}`, margin, y);
  doc.text(`Date & Time: ${formatDateTime(now)}`, pageWidth - margin, y, { align: 'right' });

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  y = drawField(doc, 'Member Name:', data.fullName, y, margin, contentWidth);
  y = drawField(doc, 'Contact Number:', data.phone, y + 3, margin, contentWidth);
  y = drawField(doc, 'Email Address:', data.email, y + 3, margin, contentWidth);
  y = drawField(doc, 'Validity Period:', data.validity, y + 3, margin, contentWidth);

  y = drawField(doc, 'Payment ID:', data.paymentId, y + 3, margin, contentWidth);
  y = drawField(doc, 'Fees Paid:', formatIndianAmount(data.amount), y + 3, margin, contentWidth);

  drawFooter(doc, Math.min(y + 14, 250));

  const safeId = (data.paymentId || receiptNo).replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `Udyam_Membership_Receipt_${safeId}.pdf`;

  doc.save(filename);
}

window.generateDonationCertificate = generateDonationCertificate;
window.generateMembershipCertificate = generateMembershipCertificate;
