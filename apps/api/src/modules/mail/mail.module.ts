import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { LogMailer, MAILER, SmtpMailer } from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.smtpUrl ? new SmtpMailer(c.smtpUrl, c.mailFrom) : new LogMailer(),
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
