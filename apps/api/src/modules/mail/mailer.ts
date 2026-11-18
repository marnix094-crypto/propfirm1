import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Mail transport interface (decision: every external integration has an interface + fake). */
export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}
export const MAILER = Symbol('MAILER');

export class SmtpMailer implements Mailer {
  private readonly transport;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(msg: MailMessage) {
    await this.transport.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
  }
}

/** Development without SMTP: logs the message (no PII beyond what the developer typed). */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');
  async send(msg: MailMessage) {
    this.logger.log(`To ${msg.to}: ${msg.subject}\n${msg.text}`);
  }
}

/** Tests: keeps messages in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
  }
  last(to: string) {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}
