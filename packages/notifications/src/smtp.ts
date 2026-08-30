import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
}

function buildTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  });
}

export async function sendSmtpEmail(config: SmtpConfig, subject: string, html: string): Promise<void> {
  const transporter = buildTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: config.toEmail,
    subject,
    html,
  });
}

/** Opens and authenticates the connection without sending anything - used by the "Test connection" button. */
export async function verifySmtpConnection(config: SmtpConfig): Promise<void> {
  await buildTransporter(config).verify();
}
