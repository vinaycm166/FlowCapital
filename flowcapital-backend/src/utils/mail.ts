import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendMail = async (to: string, subject: string, html: string) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[Mail] SMTP credentials missing. Mocking email send:');
    console.log(`[Mail] To: ${to}\n[Mail] Subject: ${subject}\n`);
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from: `"FlowCapital" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[Mail] Message sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Mail] Failed to send email:', error);
    return false;
  }
};
