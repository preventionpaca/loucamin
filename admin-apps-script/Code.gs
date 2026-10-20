const LC_ADMIN_VERSION = '1.0.0-alpha.1';
const LC_ADMIN_TABLE = 'Administrateurs';
const LC_PRODUCTS_TABLE = 'Produits';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Administration — Lou Còdi')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}

function LC_include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function LC_config_() {
  const properties = PropertiesService.getScriptProperties();
  const apiUrl = String(properties.getProperty('LC_GRIST_API_URL') || 'https://docs.getgrist.com').replace(/\/$/, '');
  const docId = String(properties.getProperty('LC_GRIST_DOC_ID') || '').trim();
  const apiKey = String(properties.getProperty('LC_GRIST_API_KEY') || '').trim();
  if (!docId || !apiKey) throw new Error('Configuration Grist incomplète.');
  return {apiUrl: apiUrl, docId: docId, apiKey: apiKey};
}

function LC_grist_(method, path, body) {
  const config = LC_config_();
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json'}
  };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch(
    config.apiUrl + '/api/docs/' + encodeURIComponent(config.docId) + path,
    options
  );
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Grist indisponible ou requête refusée (' + status + ').');
  return JSON.parse(response.getContentText() || '{}');
}

function LC_emailActif_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function LC_contexteAdministrateur_() {
  const email = LC_emailActif_();
  if (!email) throw new Error('Identité Google indisponible. Reconnectez-vous avec un compte autorisé.');
  const filter = encodeURIComponent(JSON.stringify({Email: [email]}));
  const result = LC_grist_('get', '/tables/' + LC_ADMIN_TABLE + '/records?filter=' + filter);
  const matches = (result.records || []).filter(function(record) {
    const fields = record.fields || {};
    return String(fields.Email || '').trim().toLowerCase() === email && fields.Actif === true;
  });
  if (matches.length !== 1) throw new Error('Ce compte Google n’est pas autorisé à administrer le site.');
  const fields = matches[0].fields;
  return {
    email: email,
    nom: String(fields.Nom_affichage || email),
    role: String(fields.Role || 'EDITEUR'),
    peutModifier: fields.Peut_modifier_produits === true || String(fields.Role || '').toUpperCase() === 'ADMIN'
  };
}

function LC_nettoyer_(value, limit) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').trim().slice(0, limit);
}

function LC_url_(value) {
  const url = LC_nettoyer_(value, 1000);
  if (url && !/^https:\/\//i.test(url)) throw new Error('Les liens doivent commencer par https://.');
  return url;
}

function LC_vueProduit_(record) {
  const fields = record.fields || {};
  return {
    id: Number(record.id),
    slug: String(fields.Slug || ''),
    titre: String(fields.Titre || ''),
    description: String(fields.Description || ''),
    imageUrl: String(fields.Image_URL || ''),
    lienPrincipal: String(fields.Lien_Principal || ''),
    libellePrincipal: String(fields.Libelle_Principal || ''),
    lienTelechargement: String(fields.Lien_Telechargement || ''),
    confidentialiteUrl: String(fields.Confidentialite_URL || ''),
    conditionsUrl: String(fields.Conditions_URL || ''),
    ordre: Number(fields.Ordre || 0),
    visible: fields.Visible === true,
    modifieLe: fields.Modifie_le || ''
  };
}

function chargerAdministration() {
  const admin = LC_contexteAdministrateur_();
  const result = LC_grist_('get', '/tables/' + LC_PRODUCTS_TABLE + '/records');
  const produits = (result.records || []).map(LC_vueProduit_).sort(function(a, b) {
    return a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr');
  });
  return {version: LC_ADMIN_VERSION, administrateur: admin, produits: produits};
}

function enregistrerProduit(payload) {
  const admin = LC_contexteAdministrateur_();
  if (!admin.peutModifier) throw new Error('Ce compte dispose uniquement d’un accès en lecture.');
  payload = payload || {};
  const id = Number(payload.id || 0);
  const slug = LC_nettoyer_(payload.slug, 120).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const titre = LC_nettoyer_(payload.titre, 180);
  if (!slug || !titre) throw new Error('Le titre et l’identifiant du produit sont obligatoires.');
  const now = new Date().toISOString();
  const fields = {
    Slug: slug,
    Titre: titre,
    Description: LC_nettoyer_(payload.description, 3000),
    Image_URL: LC_url_(payload.imageUrl),
    Lien_Principal: LC_url_(payload.lienPrincipal),
    Libelle_Principal: LC_nettoyer_(payload.libellePrincipal, 80),
    Lien_Telechargement: LC_url_(payload.lienTelechargement),
    Confidentialite_URL: LC_url_(payload.confidentialiteUrl),
    Conditions_URL: LC_url_(payload.conditionsUrl),
    Ordre: Math.max(0, Math.min(9999, Number(payload.ordre) || 0)),
    Visible: payload.visible === true,
    Modifie_le: now,
    Modifie_par: admin.email
  };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Une autre modification est en cours. Réessayez.');
  try {
    if (id > 0) {
      LC_grist_('patch', '/tables/' + LC_PRODUCTS_TABLE + '/records', {records: [{id: id, fields: fields}]});
      return {operation: 'modification', id: id};
    }
    fields.Cree_le = now;
    const created = LC_grist_('post', '/tables/' + LC_PRODUCTS_TABLE + '/records', {records: [{fields: fields}]});
    return {operation: 'creation', id: created.records && created.records[0] && created.records[0].id};
  } finally {
    lock.releaseLock();
  }
}
