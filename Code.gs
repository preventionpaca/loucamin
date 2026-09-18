/**
 * Lou Camin — Formulaire de contact
 * Version 5.0
 *
 * Déploiement :
 * - Application Web
 * - Exécuter en tant que : Moi
 * - Qui a accès : Tout le monde
 */

const LOUCAMIN_CONTACT_DESTINATION = 'rudy.themines@gmail.com';
const LOUCAMIN_SITE_NAME = 'Lou Camin';

function doGet() {
  return ContentService
    .createTextOutput('Lou Camin — service de contact opérationnel')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};

    // Champ invisible antispam : il doit rester vide.
    if (String(p.website || '').trim() !== '') {
      return LOUCAMIN_response_('ok');
    }

    const nom = LOUCAMIN_clean_(p.name, 120);
    const email = LOUCAMIN_clean_(p.email, 180);
    const objet = LOUCAMIN_clean_(p.subject, 180);
    const message = LOUCAMIN_clean_(p.message, 5000);

    if (!nom || !email || !objet || !message) {
      return LOUCAMIN_response_('missing');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return LOUCAMIN_response_('email');
    }

    const body = [
      'Nouveau message depuis le site Lou Camin',
      '',
      'Nom : ' + nom,
      'Adresse e-mail : ' + email,
      'Objet : ' + objet,
      '',
      'Message :',
      message
    ].join('\n');

    MailApp.sendEmail({
      to: LOUCAMIN_CONTACT_DESTINATION,
      subject: '[Lou Camin] ' + objet,
      body: body,
      replyTo: email,
      name: LOUCAMIN_SITE_NAME
    });

    return LOUCAMIN_response_('sent');

  } catch (err) {
    console.error(err);
    return LOUCAMIN_response_('error');
  }
}

function LOUCAMIN_clean_(value, maxLength) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function LOUCAMIN_response_(status) {
  return ContentService
    .createTextOutput(status)
    .setMimeType(ContentService.MimeType.TEXT);
}
