import { isLocale, type Locale } from '@brand/shared';
import { BRAND_NAME } from '../../config/brand.js';

type Template = { subject: string; text: (link: string) => string };

/** Plain-text transactional emails. Brand name from config/brand. */
const T: Record<'verify' | 'reset', Record<Locale, Template>> = {
  verify: {
    en: {
      subject: 'Confirm your email address',
      text: (l) =>
        `Welcome to ${BRAND_NAME}.\n\nConfirm your email address:\n${l}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
    },
    nl: {
      subject: 'Bevestig je e-mailadres',
      text: (l) =>
        `Welkom bij ${BRAND_NAME}.\n\nBevestig je e-mailadres:\n${l}\n\nDeze link verloopt over 24 uur. Heb je geen account aangemaakt? Negeer dan deze e-mail.`,
    },
    es: {
      subject: 'Confirma tu correo electrónico',
      text: (l) =>
        `Bienvenido a ${BRAND_NAME}.\n\nConfirma tu correo electrónico:\n${l}\n\nEste enlace caduca en 24 horas. Si no creaste una cuenta, ignora este correo.`,
    },
  },
  reset: {
    en: {
      subject: 'Reset your password',
      text: (l) =>
        `Reset your password:\n${l}\n\nThis link expires in 1 hour and can be used once. If you did not request this, ignore this email — your password stays the same.`,
    },
    nl: {
      subject: 'Stel je wachtwoord opnieuw in',
      text: (l) =>
        `Stel je wachtwoord opnieuw in:\n${l}\n\nDeze link verloopt over 1 uur en werkt één keer. Heb je dit niet aangevraagd? Negeer dan deze e-mail — je wachtwoord blijft hetzelfde.`,
    },
    es: {
      subject: 'Restablece tu contraseña',
      text: (l) =>
        `Restablece tu contraseña:\n${l}\n\nEste enlace caduca en 1 hora y solo se puede usar una vez. Si no lo solicitaste, ignora este correo: tu contraseña no cambia.`,
    },
  },
};

export function renderMail(kind: 'verify' | 'reset', locale: string, link: string) {
  const t = T[kind][isLocale(locale) ? locale : 'en'];
  return { subject: t.subject, text: t.text(link) };
}
